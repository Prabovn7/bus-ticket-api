"""Idempotent payment of a held reservation.

pay_reservation runs in three steps, and the gateway is called between two short
transactions, never inside one: holding a row lock while a slow external service
answers would block everyone else who touches that reservation.
"""

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.booking.legs import legs_for
from app.booking.models import Reservation, ReservationStatus, SeatLeg
from app.catalog.models import RouteStop, Trip
from app.core.clock import Clock
from app.core.errors import (
    DomainError,
    HoldExpired,
    IdempotencyConflict,
    PaymentInProgress,
    RequestInProgress,
    ReservationNotCancellable,
    ReservationNotFound,
    ReservationNotPayable,
    TripAlreadyDeparted,
)
from app.payments.gateway import GatewayStatus, PaymentGateway, Scenario
from app.payments.models import IdempotencyKey, Payment, PaymentStatus

# How long a hold is guaranteed to survive once a payment has started.
PAYMENT_WINDOW = timedelta(seconds=60)

_OUTCOMES = {
    GatewayStatus.APPROVED: (200, PaymentStatus.APPROVED),
    GatewayStatus.DECLINED: (402, PaymentStatus.DECLINED),
    GatewayStatus.PENDING: (202, PaymentStatus.PENDING),
}


@dataclass(frozen=True)
class PaymentResponse:
    status_code: int
    body: dict


def pay_reservation(
    session: Session,
    clock: Clock,
    gateway: PaymentGateway,
    user_id: int,
    reservation_id: int,
    idempotency_key: str,
    scenario: Scenario,
) -> PaymentResponse:
    """Charge a held reservation once, however many times the request is sent.

    A: register the key, lock the reservation, extend the hold, record a pending
       payment with its gateway reference, commit. Any domain error here rolls
       everything back, key included.
    Gateway: called with no transaction open and no lock held.
    B: record the outcome, mark the reservation paid if approved, save the
       response under the key, commit.

    If the process dies between A and B, the payment stays pending and the key
    stays in progress: a retry gets 409 and never charges twice (reconciliation
    settles it later).
    """
    request_hash = _request_hash(reservation_id, scenario)
    gateway_ref = gateway.new_reference(scenario)

    try:
        replay = _register_key(session, user_id, idempotency_key, request_hash)
        if replay is not None:
            return replay
        payment_id, amount_cents = _prepare_payment(
            session, clock, user_id, reservation_id, gateway_ref
        )
    except DomainError:
        session.rollback()
        raise
    session.commit()

    gateway_status = gateway.charge(gateway_ref, amount_cents)

    return _settle(session, user_id, idempotency_key, reservation_id, payment_id, gateway_status)


def _request_hash(reservation_id: int, scenario: Scenario) -> str:
    """Fingerprint of what the request asks for. The reservation is part of it, so a
    key reused for another reservation is a conflict, not a replay."""
    canonical = json.dumps(
        {"reservation_id": reservation_id, "scenario": scenario.value},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def _register_key(
    session: Session, user_id: int, key: str, request_hash: str
) -> PaymentResponse | None:
    """Claim the key. Returns None if this request owns it, or the saved response.

    INSERT ... ON CONFLICT DO NOTHING lets the database pick the single winner: a
    concurrent request with the same key waits for the winner's transaction A to
    finish (it is short), then sees the conflict and reads the row.
    """
    claimed = session.execute(
        insert(IdempotencyKey)
        .values(user_id=user_id, key=key, request_hash=request_hash)
        .on_conflict_do_nothing(index_elements=[IdempotencyKey.user_id, IdempotencyKey.key])
        .returning(IdempotencyKey.key)
    ).first()
    if claimed is not None:
        return None

    saved = session.execute(
        select(
            IdempotencyKey.request_hash,
            IdempotencyKey.response_status,
            IdempotencyKey.response_body,
        ).where(IdempotencyKey.user_id == user_id, IdempotencyKey.key == key)
    ).one()
    session.rollback()  # nothing was written; do not leave a transaction open
    if saved.request_hash != request_hash:
        raise IdempotencyConflict
    if saved.response_status is None:
        raise RequestInProgress
    return PaymentResponse(saved.response_status, saved.response_body)


def _prepare_payment(
    session: Session, clock: Clock, user_id: int, reservation_id: int, gateway_ref: str
) -> tuple[int, int]:
    """Lock the reservation, extend its hold and record a pending payment.

    Returns (payment_id, amount_cents). The caller commits.
    """
    reservation = session.scalar(
        select(Reservation)
        .where(Reservation.id == reservation_id, Reservation.user_id == user_id)
        .with_for_update()
    )
    if reservation is None:  # unknown or someone else's: both look like 404
        raise ReservationNotFound

    now = clock.now()
    if reservation.status in (ReservationStatus.PAID, ReservationStatus.CANCELLED):
        raise ReservationNotPayable
    if reservation.status == ReservationStatus.EXPIRED or reservation.expires_at < now:
        raise HoldExpired  # same boundary as hold_seat: over only when expires_at < now

    # Never shorten a hold: GREATEST keeps the later of the two instants. The
    # reservation moves too, because the expirer decides by reservation.expires_at.
    new_expiry = now + PAYMENT_WINDOW
    legs = legs_for(reservation.origin_position, reservation.destination_position)
    extended = session.execute(
        update(SeatLeg)
        .where(SeatLeg.reservation_id == reservation.id, SeatLeg.expires_at >= now)
        .values(expires_at=func.greatest(SeatLeg.expires_at, new_expiry))
    )
    if extended.rowcount != len(legs):  # a leg was lost: the seat is no longer ours
        raise HoldExpired
    reservation.expires_at = max(reservation.expires_at, new_expiry)

    payment = Payment(
        reservation_id=reservation.id,
        amount_cents=reservation.price_cents,
        gateway_ref=gateway_ref,
        created_at=now,
    )
    session.add(payment)
    session.flush()
    return payment.id, reservation.price_cents


def _settle(
    session: Session,
    user_id: int,
    key: str,
    reservation_id: int,
    payment_id: int,
    gateway_status: GatewayStatus,
) -> PaymentResponse:
    """Transaction B: record what the gateway said and save the response under the key."""
    status_code, payment_status = _OUTCOMES[gateway_status]
    paid = gateway_status == GatewayStatus.APPROVED
    reservation_status = ReservationStatus.PAID if paid else ReservationStatus.HELD
    body = {
        "payment_id": payment_id,
        "status": payment_status.value,
        "reservation_status": reservation_status.value,
    }

    session.execute(update(Payment).where(Payment.id == payment_id).values(status=payment_status))
    if paid:
        session.execute(
            update(Reservation)
            .where(Reservation.id == reservation_id)
            .values(status=ReservationStatus.PAID)
        )
        session.execute(
            update(SeatLeg).where(SeatLeg.reservation_id == reservation_id).values(expires_at=None)
        )
    session.execute(
        update(IdempotencyKey)
        .where(IdempotencyKey.user_id == user_id, IdempotencyKey.key == key)
        .values(response_status=status_code, response_body=body)
    )
    session.commit()
    return PaymentResponse(status_code, body)


@dataclass(frozen=True)
class CancelResult:
    reservation_id: int
    status: str
    refund_status: str  # "none", "pending" (refund still owed) or "refunded"


def cancel_reservation(
    session: Session,
    clock: Clock,
    gateway: PaymentGateway,
    user_id: int,
    reservation_id: int,
) -> CancelResult:
    """Cancel a reservation once, however many times the request is sent.

    Idempotent by state, with no key: the request that moves the reservation to
    cancelled is the only one that refunds. A: lock, check, cancel, free the seat,
    commit. Gateway: refund with no transaction open. B: mark the payment refunded.

    If the refund fails, the cancellation stands and the payment stays approved:
    a replay reports refund_status "pending" and does not retry; reconciliation will.
    """
    try:
        result, to_refund = _cancel(session, clock, user_id, reservation_id)
    except DomainError:
        session.rollback()
        raise
    session.commit()
    if to_refund is None:
        return result

    payment_id, gateway_ref = to_refund
    gateway.refund(gateway_ref)

    session.execute(
        update(Payment)
        .where(Payment.id == payment_id, Payment.status == PaymentStatus.APPROVED)
        .values(status=PaymentStatus.REFUNDED)
    )
    session.commit()
    return CancelResult(result.reservation_id, result.status, "refunded")


def _cancel(
    session: Session, clock: Clock, user_id: int, reservation_id: int
) -> tuple[CancelResult, tuple[int, str] | None]:
    """Transaction A. Returns the result and, if this request owes a refund, (payment_id, ref)."""
    reservation = session.scalar(
        select(Reservation)
        .where(Reservation.id == reservation_id, Reservation.user_id == user_id)
        .with_for_update()
    )
    if reservation is None:  # unknown or someone else's: both look like 404
        raise ReservationNotFound

    payment = session.scalar(
        select(Payment)
        .where(Payment.reservation_id == reservation.id)
        .order_by(Payment.id.desc())
        .limit(1)
    )
    if reservation.status == ReservationStatus.CANCELLED:  # replay: the state decides
        return CancelResult(reservation.id, "cancelled", _refund_status(payment)), None

    now = clock.now()
    if reservation.status == ReservationStatus.EXPIRED or (
        reservation.status == ReservationStatus.HELD and reservation.expires_at < now
    ):
        raise ReservationNotCancellable
    if payment is not None and payment.status == PaymentStatus.PENDING:
        raise PaymentInProgress
    if now >= _departure(session, reservation):
        raise TripAlreadyDeparted

    to_refund = None
    if reservation.status == ReservationStatus.PAID and payment is not None:
        to_refund = (payment.id, payment.gateway_ref)

    reservation.status = ReservationStatus.CANCELLED
    session.execute(delete(SeatLeg).where(SeatLeg.reservation_id == reservation.id))
    refund_status = "none" if to_refund is None else "pending"
    return CancelResult(reservation.id, "cancelled", refund_status), to_refund


def _refund_status(payment: Payment | None) -> str:
    if payment is None:
        return "none"
    if payment.status == PaymentStatus.REFUNDED:
        return "refunded"
    if payment.status == PaymentStatus.APPROVED:
        return "pending"  # refund in flight or failed: reconciliation settles it
    return "none"


def _departure(session: Session, reservation: Reservation) -> datetime:
    """When the bus leaves the reservation's origin stop: trip departure + that stop's offset."""
    row = session.execute(
        select(Trip.departure_at, RouteStop.offset_minutes)
        .join(RouteStop, RouteStop.route_id == Trip.route_id)
        .where(
            Trip.id == reservation.trip_id,
            RouteStop.position == reservation.origin_position,
        )
    ).one()
    return row.departure_at + timedelta(minutes=row.offset_minutes)
