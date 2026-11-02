from datetime import timedelta

import pytest

from app.booking.models import Reservation, ReservationStatus, SeatLeg
from app.booking.service import expire_holds, hold_seat, seat_statuses
from app.catalog.models import Trip
from app.core.errors import TripNotFound
from app.users.models import User

HOLD = timedelta(minutes=10)


def statuses(session, clock, trip_id) -> dict[int, str]:
    return {s.seat_number: s.status for s in seat_statuses(session, clock, trip_id)}


def add_paid_seat(session, user, trip, seat_number) -> None:
    reservation = Reservation(
        user_id=user.id,
        trip_id=trip.id,
        seat_number=seat_number,
        origin_position=1,
        destination_position=4,
        status=ReservationStatus.PAID,
        price_cents=7990,
        expires_at=None,
    )
    session.add(reservation)
    session.flush()
    for leg_index in (1, 2, 3):
        session.add(
            SeatLeg(
                trip_id=trip.id,
                seat_number=seat_number,
                leg_index=leg_index,
                reservation_id=reservation.id,
                expires_at=None,
            )
        )
    session.commit()


def test_every_seat_of_a_new_trip_is_free_and_listed_in_order(session, clock, trip):
    result = seat_statuses(session, clock, trip.id)

    assert [s.seat_number for s in result] == list(range(1, trip.capacity + 1))
    assert {s.status for s in result} == {"free"}


def test_a_held_seat_is_held_and_the_others_stay_free(session, clock, user, trip):
    hold_seat(session, clock, user.id, trip.id, 7)

    result = statuses(session, clock, trip.id)

    assert result[7] == "held"
    assert [n for n, s in result.items() if s != "free"] == [7]


def test_a_paid_seat_is_taken(session, clock, user, trip):
    add_paid_seat(session, user, trip, 3)

    assert statuses(session, clock, trip.id)[3] == "taken"


@pytest.mark.parametrize(
    ("elapsed", "expected"),
    [
        (HOLD - timedelta(seconds=1), "held"),
        (HOLD, "held"),  # exactly at expires_at the first buyer still owns it
        (HOLD + timedelta(seconds=1), "free"),
    ],
    ids=["one-second-left", "exactly-at-expiry", "one-second-late"],
)
def test_an_overdue_hold_is_free_even_before_the_expirer_runs(
    session, clock, user, trip, elapsed, expected
):
    reservation = hold_seat(session, clock, user.id, trip.id, 7)
    clock.advance(elapsed)

    assert statuses(session, clock, trip.id)[7] == expected
    session.refresh(reservation)
    assert reservation.status == ReservationStatus.HELD  # nobody expired it


def test_a_hold_taken_over_after_expiry_is_held_again(session, clock, user, trip):
    bruno = User(email="bruno@exemplo.com", password_hash="x" * 20, name="Bruno")
    session.add(bruno)
    session.commit()
    hold_seat(session, clock, user.id, trip.id, 7)
    clock.advance(HOLD + timedelta(seconds=1))
    hold_seat(session, clock, bruno.id, trip.id, 7)

    assert statuses(session, clock, trip.id)[7] == "held"


def test_a_seat_freed_by_the_expirer_is_free(session, clock, user, trip):
    hold_seat(session, clock, user.id, trip.id, 7)
    clock.advance(HOLD + timedelta(seconds=1))
    assert expire_holds(session, clock) == 1

    assert statuses(session, clock, trip.id)[7] == "free"


def test_seats_of_another_trip_do_not_leak(session, clock, user, trip):
    other = Trip(route_id=trip.route_id, departure_at=trip.departure_at + timedelta(days=1))
    session.add(other)
    session.commit()
    hold_seat(session, clock, user.id, other.id, 7)

    assert statuses(session, clock, trip.id)[7] == "free"
    assert statuses(session, clock, other.id)[7] == "held"


def test_unknown_trip_raises_trip_not_found(session, clock):
    with pytest.raises(TripNotFound):
        seat_statuses(session, clock, 999)
