from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.booking.models import Reservation, ReservationStatus, SeatLeg
from app.booking.service import hold_seat
from app.core.errors import InvalidSeat, SeatUnavailable, TripNotFound
from app.users.models import User

ATTEMPTS = 100
SEAT = 7


def count(session, model) -> int:
    return session.scalar(select(func.count()).select_from(model))


def test_hold_reserves_every_leg_of_the_trip(session, clock, trip, user):
    reservation = hold_seat(session, clock, user.id, trip.id, SEAT)

    assert reservation.status == ReservationStatus.HELD
    assert reservation.seat_number == SEAT
    assert (reservation.origin_position, reservation.destination_position) == (1, 4)
    assert reservation.price_cents == 7990
    assert reservation.expires_at == clock.now() + timedelta(minutes=10)
    legs = session.scalars(
        select(SeatLeg).where(SeatLeg.reservation_id == reservation.id).order_by(SeatLeg.leg_index)
    ).all()
    assert [leg.leg_index for leg in legs] == [1, 2, 3]
    assert all(leg.expires_at == reservation.expires_at for leg in legs)


def test_second_hold_on_the_same_seat_is_refused(session, clock, trip, user):
    hold_seat(session, clock, user.id, trip.id, SEAT)
    with pytest.raises(SeatUnavailable):
        hold_seat(session, clock, user.id, trip.id, SEAT)
    assert count(session, Reservation) == 1
    assert count(session, SeatLeg) == 3


def test_another_seat_is_still_available(session, clock, trip, user):
    hold_seat(session, clock, user.id, trip.id, SEAT)
    hold_seat(session, clock, user.id, trip.id, SEAT + 1)
    assert count(session, SeatLeg) == 6


@pytest.mark.parametrize("seat", [-1, 0, 41])
def test_seat_outside_the_capacity_is_rejected(session, clock, trip, user, seat):
    with pytest.raises(InvalidSeat):
        hold_seat(session, clock, user.id, trip.id, seat)
    assert count(session, Reservation) == 0


def test_unknown_trip_is_rejected(session, clock, user):
    with pytest.raises(TripNotFound):
        hold_seat(session, clock, user.id, 999, SEAT)


def test_hold_is_all_or_nothing(session, clock, trip, user):
    other = Reservation(
        user_id=user.id,
        trip_id=trip.id,
        seat_number=SEAT,
        origin_position=3,
        destination_position=4,
        price_cents=2490,
        expires_at=clock.now() + timedelta(minutes=5),
    )
    session.add(other)
    session.flush()
    session.add(
        SeatLeg(
            trip_id=trip.id,
            seat_number=SEAT,
            leg_index=3,
            reservation_id=other.id,
            expires_at=other.expires_at,
        )
    )
    session.commit()

    with pytest.raises(SeatUnavailable):
        hold_seat(session, clock, user.id, trip.id, SEAT)

    assert count(session, Reservation) == 1
    assert count(session, SeatLeg) == 1


def test_hundred_simultaneous_holds_on_one_seat_produce_exactly_one_winner(
    db_engine, session, clock, trip
):
    session.add_all(
        [
            User(email=f"user{n}@exemplo.com", password_hash="x" * 20, name=f"User {n}")
            for n in range(ATTEMPTS)
        ]
    )
    session.commit()
    user_ids = list(session.scalars(select(User.id)))
    trip_id = trip.id
    session.rollback()

    engine = create_engine(db_engine.url, pool_size=40, max_overflow=0)

    def attempt(user_id: int) -> bool:
        with Session(engine) as own_session:
            try:
                hold_seat(own_session, clock, user_id, trip_id, SEAT)
            except SeatUnavailable:
                return False
            return True

    with ThreadPoolExecutor(max_workers=ATTEMPTS) as pool:
        results = list(pool.map(attempt, user_ids))
    engine.dispose()

    assert results.count(True) == 1
    assert results.count(False) == ATTEMPTS - 1
    assert count(session, Reservation) == 1
    assert count(session, SeatLeg) == 3
