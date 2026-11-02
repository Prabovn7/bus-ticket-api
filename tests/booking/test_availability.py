from datetime import timedelta

from app.booking.models import Reservation, ReservationStatus, SeatLeg
from app.booking.service import free_seat_counts, hold_seat
from app.catalog.models import Trip

HOLD = timedelta(minutes=10)


def free_by_trip(session, clock, trip_ids) -> dict[int, int]:
    return {a.trip_id: a.free for a in free_seat_counts(session, clock, trip_ids)}


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


def other_trip(session, trip) -> Trip:
    other = Trip(route_id=trip.route_id, departure_at=trip.departure_at + timedelta(days=1))
    session.add(other)
    session.commit()
    return other


def test_a_new_trip_has_every_seat_free(session, clock, trip):
    result = free_seat_counts(session, clock, [trip.id])

    assert [(a.trip_id, a.capacity, a.free) for a in result] == [(trip.id, 40, 40)]


def test_a_seat_with_three_legs_counts_once(session, clock, user, trip):
    hold_seat(session, clock, user.id, trip.id, 7)

    assert free_by_trip(session, clock, [trip.id]) == {trip.id: 39}


def test_a_paid_seat_is_not_free(session, clock, user, trip):
    add_paid_seat(session, user, trip, 3)

    assert free_by_trip(session, clock, [trip.id]) == {trip.id: 39}


def test_held_and_paid_seats_add_up(session, clock, user, trip):
    add_paid_seat(session, user, trip, 3)
    hold_seat(session, clock, user.id, trip.id, 7)
    hold_seat(session, clock, user.id, trip.id, 8)

    assert free_by_trip(session, clock, [trip.id]) == {trip.id: 37}


def test_an_overdue_hold_is_free_again_and_the_boundary_still_holds(session, clock, user, trip):
    hold_seat(session, clock, user.id, trip.id, 7)

    clock.advance(HOLD)  # exactly at expires_at: still the first buyer's
    assert free_by_trip(session, clock, [trip.id]) == {trip.id: 39}

    clock.advance(timedelta(seconds=1))
    assert free_by_trip(session, clock, [trip.id]) == {trip.id: 40}


def test_each_trip_has_its_own_count_in_trip_id_order(session, clock, user, trip):
    other = other_trip(session, trip)
    hold_seat(session, clock, user.id, other.id, 1)
    hold_seat(session, clock, user.id, other.id, 2)

    result = free_seat_counts(session, clock, [other.id, trip.id])

    assert [(a.trip_id, a.free) for a in result] == [(trip.id, 40), (other.id, 38)]


def test_unknown_trips_are_left_out(session, clock, trip):
    assert free_by_trip(session, clock, [trip.id, 999]) == {trip.id: 40}


def test_repeated_ids_give_one_entry(session, clock, trip):
    assert len(free_seat_counts(session, clock, [trip.id, trip.id])) == 1


def test_no_ids_give_an_empty_list(session, clock, trip):
    assert free_seat_counts(session, clock, []) == []


def test_trips_that_were_not_asked_for_are_left_out(session, clock, trip):
    other = other_trip(session, trip)

    assert free_by_trip(session, clock, [other.id]) == {other.id: 40}
