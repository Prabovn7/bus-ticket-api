"""Seat delivery: the money is in, so the reservation gets its seat if it is still ours."""

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.booking.legs import legs_for
from app.booking.models import Reservation, ReservationStatus, SeatLeg


def deliver_seat(session: Session, reservation_id: int) -> None:
    """The money is in: give the seat to the reservation if it is still ours.

    If the legs were taken by someone else, the reservation cannot be completed. It is
    marked expired, and the payment, now approved on an unpaid reservation, is refunded
    by the second phase of the reconciliation. Legs that belong to someone else are
    never touched.
    """
    reservation = session.scalar(
        select(Reservation).where(Reservation.id == reservation_id).with_for_update()
    )
    if reservation.status != ReservationStatus.HELD:
        return  # expired or cancelled already: its legs are gone, nothing to deliver

    legs = legs_for(reservation.origin_position, reservation.destination_position)
    attempt = session.begin_nested()  # a SAVEPOINT: all legs or none
    owned = session.execute(
        update(SeatLeg).where(SeatLeg.reservation_id == reservation.id).values(expires_at=None)
    )
    if owned.rowcount == len(legs):
        attempt.commit()
        reservation.status = ReservationStatus.PAID
    else:
        attempt.rollback()  # leave the legs exactly as they were
        session.execute(delete(SeatLeg).where(SeatLeg.reservation_id == reservation.id))
        reservation.status = ReservationStatus.EXPIRED
