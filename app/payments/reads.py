"""Leitura de reservas do usuário, com o estado do pagamento mais recente.

Mora em payments porque lê a tabela payments, e payments pode depender de booking
(nunca o contrário). O GET só lê: um hold vencido aparece como expired, mas quem
grava essa mudança é o expirador.
"""

from datetime import datetime
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.booking.models import Reservation, ReservationStatus
from app.core.clock import Clock
from app.core.errors import ReservationNotFound
from app.payments.models import Payment

LIST_LIMIT = 50

# Subconsulta correlacionada: o status do pagamento mais recente da reserva, ou NULL.
_LATEST_PAYMENT_STATUS = (
    select(Payment.status)
    .where(Payment.reservation_id == Reservation.id)
    .order_by(Payment.id.desc())
    .limit(1)
    .scalar_subquery()
)


class ReservationView(NamedTuple):
    id: int
    trip_id: int
    seat_number: int
    origin_position: int
    destination_position: int
    status: str
    price_cents: int
    expires_at: datetime | None
    expires_in_seconds: int | None
    payment_status: str | None


def get_reservation(
    session: Session, clock: Clock, user_id: int, reservation_id: int
) -> ReservationView:
    row = session.execute(
        select(Reservation, _LATEST_PAYMENT_STATUS).where(
            Reservation.id == reservation_id, Reservation.user_id == user_id
        )
    ).first()
    if row is None:  # inexistente ou de outra pessoa: os dois são 404
        raise ReservationNotFound
    reservation, payment_status = row
    return _view(reservation, payment_status, clock.now())


def list_reservations(session: Session, clock: Clock, user_id: int) -> list[ReservationView]:
    rows = session.execute(
        select(Reservation, _LATEST_PAYMENT_STATUS)
        .where(Reservation.user_id == user_id)
        .order_by(Reservation.id.desc())
        .limit(LIST_LIMIT)
    ).all()
    now = clock.now()
    return [_view(reservation, payment_status, now) for reservation, payment_status in rows]


def _view(reservation: Reservation, payment_status: str | None, now: datetime) -> ReservationView:
    status = reservation.status
    if status == ReservationStatus.HELD and reservation.expires_at < now:
        status = ReservationStatus.EXPIRED.value  # mesma fronteira do hold_seat: vence com <

    expires_at: datetime | None = None
    seconds: int | None = None
    if status == ReservationStatus.HELD:
        expires_at = reservation.expires_at
        seconds = max(0, int((expires_at - now).total_seconds()))
    elif status == ReservationStatus.EXPIRED:
        expires_at, seconds = reservation.expires_at, 0

    return ReservationView(
        id=reservation.id,
        trip_id=reservation.trip_id,
        seat_number=reservation.seat_number,
        origin_position=reservation.origin_position,
        destination_position=reservation.destination_position,
        status=status,
        price_cents=reservation.price_cents,
        expires_at=expires_at,
        expires_in_seconds=seconds,
        payment_status=payment_status,
    )
