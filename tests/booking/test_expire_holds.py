from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.booking.models import Reservation, ReservationStatus, SeatLeg
from app.booking.service import expire_holds, hold_seat
from app.users.models import User

SEAT = 7


def hold_many(session, clock, trip_id, user_id, seats) -> list[int]:
    return [hold_seat(session, clock, user_id, trip_id, seat).id for seat in seats]


def status_of(session, reservation_id) -> str:
    return session.get(Reservation, reservation_id).status


def leg_count(session) -> int:
    return session.scalar(select(func.count()).select_from(SeatLeg))


def test_expired_hold_is_marked_expired_and_its_legs_are_freed(session, clock, trip, user):
    reservation_id = hold_seat(session, clock, user.id, trip.id, SEAT).id
    clock.advance(timedelta(minutes=10, seconds=1))

    assert expire_holds(session, clock) == 1

    assert status_of(session, reservation_id) == ReservationStatus.EXPIRED
    assert leg_count(session) == 0


def test_hold_that_has_not_expired_is_left_alone(session, clock, trip, user):
    reservation_id = hold_seat(session, clock, user.id, trip.id, SEAT).id
    clock.advance(timedelta(minutes=10))  # exactly at the expiry instant: still valid

    assert expire_holds(session, clock) == 0

    assert status_of(session, reservation_id) == ReservationStatus.HELD
    assert leg_count(session) == 3


def test_paid_reservation_is_never_expired(session, clock, trip, user):
    paid = Reservation(
        user_id=user.id,
        trip_id=trip.id,
        seat_number=SEAT,
        origin_position=1,
        destination_position=4,
        status=ReservationStatus.PAID,
        price_cents=7990,
        expires_at=clock.now() - timedelta(hours=1),
    )
    session.add(paid)
    session.flush()
    session.add_all(
        SeatLeg(
            trip_id=trip.id,
            seat_number=SEAT,
            leg_index=leg_index,
            reservation_id=paid.id,
            expires_at=None,
        )
        for leg_index in (1, 2, 3)
    )
    session.commit()
    paid_id = paid.id

    assert expire_holds(session, clock) == 0

    assert status_of(session, paid_id) == ReservationStatus.PAID
    assert leg_count(session) == 3


def test_expiring_a_taken_over_reservation_does_not_free_the_new_owner_legs(
    session, clock, trip, user
):
    first_id = hold_seat(session, clock, user.id, trip.id, SEAT).id
    bruno = User(email="bruno@exemplo.com", password_hash="x" * 20, name="Bruno")
    session.add(bruno)
    session.commit()
    clock.advance(timedelta(minutes=10, seconds=1))
    second_id = hold_seat(session, clock, bruno.id, trip.id, SEAT).id

    assert expire_holds(session, clock) == 1

    assert status_of(session, first_id) == ReservationStatus.EXPIRED
    assert status_of(session, second_id) == ReservationStatus.HELD
    legs = session.scalars(select(SeatLeg)).all()
    assert len(legs) == 3
    assert all(leg.reservation_id == second_id for leg in legs)


def test_batch_size_limits_how_many_reservations_one_run_expires(session, clock, trip, user):
    hold_many(session, clock, trip.id, user.id, range(1, 6))
    clock.advance(timedelta(minutes=11))

    runs = [expire_holds(session, clock, batch_size=2) for _ in range(4)]

    assert runs == [2, 2, 1, 0]
    assert leg_count(session) == 0


def test_expirer_skips_reservations_locked_by_another_transaction(
    db_engine, session, clock, trip, user
):
    locked_id, free_id = hold_many(session, clock, trip.id, user.id, [1, 2])
    clock.advance(timedelta(minutes=11))
    session.rollback()

    locker = Session(db_engine)
    locker.execute(select(Reservation.id).where(Reservation.id == locked_id).with_for_update())
    # Without SKIP LOCKED the second transaction would wait and fail by lock_timeout.
    engine = create_engine(db_engine.url, connect_args={"options": "-c lock_timeout=2000"})
    try:
        with Session(engine) as other:
            expired = expire_holds(other, clock)
    finally:
        locker.rollback()
        locker.close()
        engine.dispose()

    assert expired == 1
    assert status_of(session, free_id) == ReservationStatus.EXPIRED
    assert status_of(session, locked_id) == ReservationStatus.HELD


def test_two_expirers_running_together_expire_each_reservation_once(
    db_engine, session, clock, trip, user
):
    total = 30
    hold_many(session, clock, trip.id, user.id, range(1, total + 1))
    clock.advance(timedelta(minutes=11))
    session.rollback()

    engine = create_engine(db_engine.url, pool_size=2, max_overflow=0)

    def expirer(_: int) -> int:
        done = 0
        with Session(engine) as own_session:
            for _run in range(total):  # bounded: a bug must fail the test, not hang it
                processed = expire_holds(own_session, clock, batch_size=5)
                if processed == 0:
                    break
                done += processed
        return done

    with ThreadPoolExecutor(max_workers=2) as pool:
        first, second = pool.map(expirer, range(2))
    engine.dispose()

    assert first + second == total
    statuses = session.scalars(select(Reservation.status)).all()
    assert statuses.count(ReservationStatus.EXPIRED) == total
    assert leg_count(session) == 0
