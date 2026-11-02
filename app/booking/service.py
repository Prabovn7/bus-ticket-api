from datetime import timedelta
from typing import NamedTuple

from sqlalchemy import and_, delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.booking.legs import legs_for
from app.booking.models import Reservation, ReservationStatus, SeatLeg
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


def expire_holds(session: Session, clock: Clock, batch_size: int = 100) -> int:
    """Mark overdue holds as expired and free their legs. Returns how many expired.

    FOR UPDATE SKIP LOCKED lets several expirers run at once: each one takes the
    overdue reservations nobody else holds, instead of waiting for them. Paid
    reservations never match, and a leg is deleted only if it still belongs to the
    reservation being expired, so a buyer who already took the seat over keeps it.
    """
    now = clock.now()
    reservation_ids = list(
        session.scalars(
            select(Reservation.id)
            .where(Reservation.status == ReservationStatus.HELD, Reservation.expires_at < now)
            .order_by(Reservation.id)
            .limit(batch_size)
            .with_for_update(skip_locked=True)
        )
    )
    if not reservation_ids:
        session.rollback()
        return 0

    session.execute(delete(SeatLeg).where(SeatLeg.reservation_id.in_(reservation_ids)))
    session.execute(
        update(Reservation)
        .where(Reservation.id.in_(reservation_ids))
        .values(status=ReservationStatus.EXPIRED)
    )
    session.commit()
    return len(reservation_ids)


class SeatStatus(NamedTuple):
    seat_number: int
    status: str  # "free" | "held" | "taken"


def seat_statuses(session: Session, clock: Clock, trip_id: int) -> list[SeatStatus]:
    """Status of every seat of a trip, computed from the legs and the clock.

    An overdue hold counts as free right away: availability never waits for the
    expirer, which is only housekeeping (ADR 0005). The boundary matches
    hold_seat: a hold is over only when expires_at < now, so at the exact
    instant it still belongs to the first buyer.

    Today a hold covers the whole trip, so any occupied leg makes the seat busy.
    Phase 4 will need a per-stretch answer.
    """
    trip = session.get(Trip, trip_id)
    if trip is None:
        raise TripNotFound

    now = clock.now()
    rows = session.execute(
        select(
            SeatLeg.seat_number,
            func.bool_or(SeatLeg.expires_at.is_(None)).label("taken"),
            func.bool_or(SeatLeg.expires_at >= now).label("held"),
        )
        .where(SeatLeg.trip_id == trip_id)
        .group_by(SeatLeg.seat_number)
    )
    by_seat = {row.seat_number: row for row in rows}

    result = []
    for seat_number in range(1, trip.capacity + 1):
        row = by_seat.get(seat_number)
        if row is not None and row.taken:
            status = "taken"
        elif row is not None and row.held:
            status = "held"
        else:
            status = "free"
        result.append(SeatStatus(seat_number, status))
    return result
