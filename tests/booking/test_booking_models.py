from datetime import UTC, datetime

import pytest
from sqlalchemy.exc import IntegrityError

from app.booking.models import Reservation, ReservationStatus, SeatLeg
from app.catalog.models import Route, Trip
from app.users.models import User

DEPARTURE = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)
EXPIRES = datetime(2026, 11, 20, 12, 10, tzinfo=UTC)


def make_user(session, email="ana@exemplo.com") -> User:
    user = User(email=email, password_hash="x" * 20, name="Ana")
    session.add(user)
    session.flush()
    return user


def make_trip(session) -> Trip:
    route = Route(name="SP-MG")
    session.add(route)
    session.flush()
    trip = Trip(route_id=route.id, departure_at=DEPARTURE)
    session.add(trip)
    session.flush()
    return trip


def make_reservation(session, user, trip, seat=1, origin=1, destination=4, **overrides):
    fields = {
        "user_id": user.id,
        "trip_id": trip.id,
        "seat_number": seat,
        "origin_position": origin,
        "destination_position": destination,
        "price_cents": 7990,
        "expires_at": EXPIRES,
    }
    reservation = Reservation(**{**fields, **overrides})
    session.add(reservation)
    session.flush()
    return reservation


def make_leg(session, trip, reservation, seat=1, leg=1) -> SeatLeg:
    seat_leg = SeatLeg(
        trip_id=trip.id,
        seat_number=seat,
        leg_index=leg,
        reservation_id=reservation.id,
        expires_at=EXPIRES,
    )
    session.add(seat_leg)
    session.flush()
    return seat_leg


def test_valid_hold_is_accepted_and_starts_as_held(session):
    user = make_user(session)
    trip = make_trip(session)
    reservation = make_reservation(session, user, trip)
    make_leg(session, trip, reservation, leg=1)
    assert reservation.status == ReservationStatus.HELD


def test_same_seat_and_leg_cannot_be_taken_twice(session):
    user = make_user(session)
    trip = make_trip(session)
    first = make_reservation(session, user, trip)
    second = make_reservation(session, user, trip)
    make_leg(session, trip, first)
    with pytest.raises(IntegrityError):
        make_leg(session, trip, second)


def test_same_seat_on_another_leg_is_accepted(session):
    user = make_user(session)
    trip = make_trip(session)
    reservation = make_reservation(session, user, trip)
    make_leg(session, trip, reservation, leg=1)
    make_leg(session, trip, reservation, leg=2)


def test_another_seat_on_the_same_leg_is_accepted(session):
    user = make_user(session)
    trip = make_trip(session)
    first = make_reservation(session, user, trip, seat=1)
    second = make_reservation(session, user, trip, seat=2)
    make_leg(session, trip, first, seat=1)
    make_leg(session, trip, second, seat=2)


def test_same_seat_and_leg_on_another_trip_is_accepted(session):
    user = make_user(session)
    trip_a = make_trip(session)
    trip_b = make_trip(session)
    make_leg(session, trip_a, make_reservation(session, user, trip_a))
    make_leg(session, trip_b, make_reservation(session, user, trip_b))


@pytest.mark.parametrize(("origin", "destination"), [(4, 4), (4, 2)])
def test_origin_must_come_before_destination(session, origin, destination):
    user = make_user(session)
    trip = make_trip(session)
    with pytest.raises(IntegrityError):
        make_reservation(session, user, trip, origin=origin, destination=destination)


def test_unknown_status_is_rejected(session):
    user = make_user(session)
    trip = make_trip(session)
    with pytest.raises(IntegrityError):
        make_reservation(session, user, trip, status="confirmed")


def test_reservation_seat_number_must_be_positive(session):
    user = make_user(session)
    trip = make_trip(session)
    with pytest.raises(IntegrityError):
        make_reservation(session, user, trip, seat=0)


def test_seat_leg_seat_number_must_be_positive(session):
    user = make_user(session)
    trip = make_trip(session)
    reservation = make_reservation(session, user, trip)
    with pytest.raises(IntegrityError):
        make_leg(session, trip, reservation, seat=0)


def test_leg_index_must_be_positive(session):
    user = make_user(session)
    trip = make_trip(session)
    reservation = make_reservation(session, user, trip)
    with pytest.raises(IntegrityError):
        make_leg(session, trip, reservation, leg=0)


def test_negative_price_is_rejected(session):
    user = make_user(session)
    trip = make_trip(session)
    with pytest.raises(IntegrityError):
        make_reservation(session, user, trip, price_cents=-1)


def test_seat_leg_needs_an_existing_reservation(session):
    trip = make_trip(session)
    session.add(
        SeatLeg(trip_id=trip.id, seat_number=1, leg_index=1, reservation_id=999, expires_at=None)
    )
    with pytest.raises(IntegrityError):
        session.flush()
