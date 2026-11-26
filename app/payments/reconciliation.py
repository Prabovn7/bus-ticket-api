"""Payment reconciliation: settle payments whose answer was lost, and return owed refunds.

Two phases. The gateway is never called with a transaction open or a row locked.

1. Settle pending payments. A payment still pending after MIN_PAYMENT_AGE lost its answer
   (the process died between the charge and transaction B). The gateway is asked about
   its reference; then, under a row lock, the answer is applied: declined, or approved,
   in which case the seat is delivered if the reservation still owns it.
2. Refund what is owed: an approved payment whose reservation is not paid (the sale could
   not be completed, or the refund failed when the reservation was cancelled).

gateway.refund must be safe to repeat for the same reference, as real gateways are: two
reconcilers, or a reconciler and a request that is still cancelling, may both call it.
"""

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.booking.models import Reservation, ReservationStatus
from app.core.clock import Clock
from app.payments.delivery import deliver_seat
from app.payments.gateway import GatewayStatus, PaymentGateway
from app.payments.models import Payment, PaymentStatus

# A payment is only asked about after this long: a request that is still waiting for
# the gateway is not a lost answer. Shorter than the 60 s payment window on purpose.
MIN_PAYMENT_AGE = timedelta(seconds=45)
BATCH_SIZE = 100


@dataclass(frozen=True)
class ReconcileSummary:
    settled: int  # pending payments that left "pending"
    refunded: int  # owed refunds that were sent


def reconcile_payments(
    session: Session,
    clock: Clock,
    gateway: PaymentGateway,
    batch_size: int = BATCH_SIZE,
    min_age: timedelta = MIN_PAYMENT_AGE,
) -> ReconcileSummary:
    settled = _settle_pending(session, clock, gateway, batch_size, min_age)
    refunded = _refund_owed(session, gateway, batch_size)
    return ReconcileSummary(settled=settled, refunded=refunded)


def _settle_pending(
    session: Session,
    clock: Clock,
    gateway: PaymentGateway,
    batch_size: int,
    min_age: timedelta,
) -> int:
    cutoff = clock.now() - min_age
    candidates = session.execute(
        select(Payment.id, Payment.gateway_ref)
        .where(
            Payment.status == PaymentStatus.PENDING,
            Payment.created_at <= cutoff,
            Payment.gateway_ref.is_not(None),
        )
        .order_by(Payment.id)
        .limit(batch_size)
    ).all()
    session.rollback()  # end the read: no connection or snapshot is held while the gateway answers

    settled = 0
    for payment_id, ref in candidates:
        gateway_status = gateway.get_status(ref)
        if gateway_status == GatewayStatus.PENDING:
            continue  # the gateway has not decided yet: ask again next round
        if _apply(session, payment_id, gateway_status):
            settled += 1
    return settled


def _apply(session: Session, payment_id: int, gateway_status: GatewayStatus) -> bool:
    """Record the gateway's answer on a payment that is still pending.

    SKIP LOCKED plus the status filter make this safe against a second reconciler and
    against transaction B of the original request: whoever finds the row locked or
    already resolved does nothing. Returns whether this call applied the answer.
    """
    payment = session.scalar(
        select(Payment)
        .where(Payment.id == payment_id, Payment.status == PaymentStatus.PENDING)
        .with_for_update(skip_locked=True)
    )
    if payment is None:
        session.rollback()
        return False

    if gateway_status == GatewayStatus.DECLINED:
        payment.status = PaymentStatus.DECLINED
    else:
        payment.status = PaymentStatus.APPROVED
        deliver_seat(session, payment.reservation_id)
    session.commit()
    return True


def _refund_owed(session: Session, gateway: PaymentGateway, batch_size: int) -> int:
    owed = session.execute(
        select(Payment.id, Payment.gateway_ref)
        .join(Reservation, Reservation.id == Payment.reservation_id)
        .where(
            Payment.status == PaymentStatus.APPROVED,
            Reservation.status.in_([ReservationStatus.CANCELLED, ReservationStatus.EXPIRED]),
            Payment.gateway_ref.is_not(None),
        )
        .order_by(Payment.id)
        .limit(batch_size)
    ).all()
    session.rollback()

    refunded = 0
    for payment_id, ref in owed:
        gateway.refund(ref)
        result = session.execute(
            update(Payment)
            .where(Payment.id == payment_id, Payment.status == PaymentStatus.APPROVED)
            .values(status=PaymentStatus.REFUNDED)
        )
        session.commit()
        refunded += result.rowcount
    return refunded
