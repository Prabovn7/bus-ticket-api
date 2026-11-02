from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.booking.models import Reservation, ReservationStatus, SeatLeg
from app.booking.service import hold_seat
from app.core.errors import SeatUnavailable
from app.users.models import User

SEAT = 7
ATTEMPTS = 100


def make_user(session, number: int) -> User:
    user = User(email=f"buyer{number}@exemplo.com", password_hash="x" * 20, name=f"Buyer {number}")
    session.add(user)
    session.commit()
    return user


def legs_of(session) -> list[SeatLeg]:
    return list(session.scalars(select(SeatLeg).order_by(SeatLeg.leg_index)))


@pytest.mark.parametrize(
    "elapsed",
    [timedelta(0), timedelta(minutes=9, seconds=59), timedelta(minutes=10)],
    ids=["just-held", "one-second-left", "exactly-at-expiry"],
)
def test_a_hold_that_has_not_expired_keeps_blocking(session, clock, trip, user, elapsed):
    hold_seat(session, clock, user.id, trip.id, SEAT)
    bruno = make_user(session, 2)
    clock.advance(elapsed)

    with pytest.raises(SeatUnavailable):
        hold_seat(session, clock, bruno.id, trip.id, SEAT)

    assert len(legs_of(session)) == 3


def test_an_expired_hold_is_taken_over_by_a_new_buyer(session, clock, trip, user):
    first = hold_seat(session, clock, user.id, trip.id, SEAT)
    first_id = first.id
    bruno = make_user(session, 2)
    clock.advance(timedelta(minutes=10, seconds=1))

    second = hold_seat(session, clock, bruno.id, trip.id, SEAT)

    assert second.id != first_id
    assert second.expires_at == clock.now() + timedelta(minutes=10)
    legs = legs_of(session)
    assert [leg.leg_index for leg in legs] == [1, 2, 3]
    assert all(leg.reservation_id == second.id for leg in legs)
    assert all(leg.expires_at == second.expires_at for leg in legs)


def test_the_taken_over_reservation_stays_held_until_the_active_expirer_runs(
    session, clock, trip, user
):
    # Known gap, closed by the active expiration (Task 29): the lazy takeover frees
    # the legs but does not touch the old reservation row.
    first = hold_seat(session, clock, user.id, trip.id, SEAT)
    first_id = first.id
    bruno = make_user(session, 2)
    clock.advance(timedelta(minutes=10, seconds=1))
    hold_seat(session, clock, bruno.id, trip.id, SEAT)

    old = session.get(Reservation, first_id)
    assert old.status == ReservationStatus.HELD
    assert old.expires_at < clock.now()
    assert session.scalars(select(SeatLeg).where(SeatLeg.reservation_id == first_id)).all() == []


def test_hundred_buyers_race_for_an_expired_hold_and_only_one_takes_it(
    db_engine, session, clock, trip, user
):
    first = hold_seat(session, clock, user.id, trip.id, SEAT)
    first_id = first.id
    session.add_all(
        [
            User(email=f"racer{n}@exemplo.com", password_hash="x" * 20, name=f"Racer {n}")
            for n in range(ATTEMPTS)
        ]
    )
    session.commit()
    racer_ids = list(session.scalars(select(User.id).where(User.email.like("racer%"))))
    trip_id = trip.id
    clock.advance(timedelta(minutes=10, seconds=1))
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
        results = list(pool.map(attempt, racer_ids))
    engine.dispose()

    assert results.count(True) == 1
    assert results.count(False) == ATTEMPTS - 1
    legs = legs_of(session)
    assert len(legs) == 3
    assert len({leg.reservation_id for leg in legs}) == 1
    assert legs[0].reservation_id != first_id
    assert len(session.scalars(select(Reservation)).all()) == 2
