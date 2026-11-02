from datetime import timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.booking.legs import legs_for
from app.booking.models import Reservation, SeatLeg
from app.catalog.models import RouteStop, Trip
from app.core.clock import Clock
from app.core.errors import InvalidSeat, SeatUnavailable, TripNotFound

HOLD_DURATION = timedelta(minutes=10)


def hold_seat(
    session: Session, clock: Clock, user_id: int, trip_id: int, seat_number: int
) -> Reservation:
    """Hold one seat for the whole trip for 10 minutes, or raise SeatUnavailable.

    The database decides who wins: every leg is inserted with ON CONFLICT against
    the UNIQUE (trip_id, seat_number, leg_index), so two buyers can never both
    get the same leg. If any leg is refused, the whole transaction is rolled back.
    """
    trip = session.get(Trip, trip_id)
    if trip is None:
        raise TripNotFound
    if not 1 <= seat_number <= trip.capacity:
        raise InvalidSeat

    last_position = session.scalar(
        select(func.max(RouteStop.position)).where(RouteStop.route_id == trip.route_id)
    )
    legs = legs_for(1, last_position)
    price_cents = session.scalar(
        select(func.sum(RouteStop.price_to_next_cents)).where(
            RouteStop.route_id == trip.route_id, RouteStop.position < last_position
        )
    )

    now = clock.now()
    expires_at = now + HOLD_DURATION
    reservation = Reservation(
        user_id=user_id,
        trip_id=trip_id,
        seat_number=seat_number,
        origin_position=1,
        destination_position=last_position,
        price_cents=price_cents,
        expires_at=expires_at,
    )
    session.add(reservation)
    session.flush()

    for leg_index in legs:  # ascending order, so concurrent holds never deadlock
        statement = (
            insert(SeatLeg)
            .values(
                trip_id=trip_id,
                seat_number=seat_number,
                leg_index=leg_index,
                reservation_id=reservation.id,
                expires_at=expires_at,
            )
            .on_conflict_do_update(
                index_elements=[SeatLeg.trip_id, SeatLeg.seat_number, SeatLeg.leg_index],
                set_={"reservation_id": reservation.id, "expires_at": expires_at},
                where=and_(SeatLeg.expires_at.is_not(None), SeatLeg.expires_at < now),
            )
            .returning(SeatLeg.leg_index)
        )
        if session.execute(statement).first() is None:
            session.rollback()
            raise SeatUnavailable

    session.commit()
    return reservation
