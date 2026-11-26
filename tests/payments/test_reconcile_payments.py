from datetime import timedelta

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.booking.models import Reservation, ReservationStatus, SeatLeg
from app.booking.service import expire_holds, hold_seat
from app.payments.gateway import Scenario, SimulatedGateway
from app.payments.models import Payment, PaymentStatus
from app.payments.reconciliation import MIN_PAYMENT_AGE, ReconcileSummary, reconcile_payments
from app.payments.service import cancel_reservation, pay_reservation

LEGS = 3  # four stops, three legs
PAST_THE_HOLD = timedelta(minutes=11)  # longer than the 10-minute hold


class GatewayDown(Exception):
    pass


def pay(session, clock, gateway, user, reservation, key="key-1", scenario=Scenario.APPROVE):
    return pay_reservation(session, clock, gateway, user.id, reservation.id, key, scenario)


def leave_pending(
    session, clock, gateway, user, reservation, key="key-1", scenario=Scenario.APPROVE
):
    """Pay, but lose the gateway's answer: the payment stays pending, with its reference."""
    gateway.fail_with = GatewayDown("connection lost")
    with pytest.raises(GatewayDown):
        pay(session, clock, gateway, user, reservation, key, scenario)
    gateway.fail_with = None


def payment_of(session, reservation) -> Payment:
    session.expire_all()
    return session.scalars(select(Payment).where(Payment.reservation_id == reservation.id)).one()


def reservation_status(session, reservation) -> str:
    session.expire_all()
    return session.scalar(select(Reservation.status).where(Reservation.id == reservation.id))


def leg_expiries(session, reservation) -> list:
    query = select(SeatLeg.expires_at).where(SeatLeg.reservation_id == reservation.id)
    return list(session.scalars(query))


def test_a_young_payment_is_left_alone(session, clock, gateway, user, reservation):
    leave_pending(session, clock, gateway, user, reservation)
    clock.advance(MIN_PAYMENT_AGE - timedelta(seconds=1))

    summary = reconcile_payments(session, clock, gateway)

    assert summary == ReconcileSummary(settled=0, refunded=0)
    assert payment_of(session, reservation).status == PaymentStatus.PENDING


def test_a_lost_answer_is_settled_from_the_gateway(session, clock, gateway, user, reservation):
    leave_pending(session, clock, gateway, user, reservation)
    clock.advance(MIN_PAYMENT_AGE)

    summary = reconcile_payments(session, clock, gateway)

    assert summary == ReconcileSummary(settled=1, refunded=0)
    assert payment_of(session, reservation).status == PaymentStatus.APPROVED
    assert reservation_status(session, reservation) == ReservationStatus.PAID
    assert leg_expiries(session, reservation) == [None] * LEGS


def test_a_declined_charge_is_recorded_as_declined(session, clock, gateway, user, reservation):
    leave_pending(session, clock, gateway, user, reservation, scenario=Scenario.DECLINE)
    clock.advance(MIN_PAYMENT_AGE)

    summary = reconcile_payments(session, clock, gateway)

    assert summary == ReconcileSummary(settled=1, refunded=0)
    assert payment_of(session, reservation).status == PaymentStatus.DECLINED
    assert reservation_status(session, reservation) == ReservationStatus.HELD
    expiries = leg_expiries(session, reservation)
    assert len(expiries) == LEGS
    assert None not in expiries


def test_a_payment_still_pending_at_the_gateway_waits(session, clock, gateway, user, reservation):
    leave_pending(session, clock, gateway, user, reservation, scenario=Scenario.DELAY)
    clock.advance(MIN_PAYMENT_AGE)
    slow_gateway = SimulatedGateway(clock, delay_seconds=120)

    summary = reconcile_payments(session, clock, slow_gateway)

    assert summary == ReconcileSummary(settled=0, refunded=0)
    assert payment_of(session, reservation).status == PaymentStatus.PENDING


def test_a_late_approval_is_refunded_after_the_sweep(session, clock, gateway, user, reservation):
    leave_pending(session, clock, gateway, user, reservation)
    ref = payment_of(session, reservation).gateway_ref
    clock.advance(PAST_THE_HOLD)
    assert expire_holds(session, clock) == 1

    summary = reconcile_payments(session, clock, gateway)

    assert summary == ReconcileSummary(settled=1, refunded=1)
    assert gateway.refunds == [ref]
    assert payment_of(session, reservation).status == PaymentStatus.REFUNDED
    assert reservation_status(session, reservation) == ReservationStatus.EXPIRED
    assert leg_expiries(session, reservation) == []


def test_a_late_approval_never_touches_the_new_owner_of_the_seat(
    session, clock, gateway, user, other_user, trip, reservation
):
    leave_pending(session, clock, gateway, user, reservation)
    clock.advance(PAST_THE_HOLD)
    taken = hold_seat(session, clock, other_user.id, trip.id, reservation.seat_number)

    summary = reconcile_payments(session, clock, gateway)

    assert summary == ReconcileSummary(settled=1, refunded=1)
    assert payment_of(session, reservation).status == PaymentStatus.REFUNDED
    assert reservation_status(session, reservation) == ReservationStatus.EXPIRED
    assert reservation_status(session, taken) == ReservationStatus.HELD
    assert len(leg_expiries(session, taken)) == LEGS
    assert leg_expiries(session, reservation) == []


def test_expired_legs_that_are_still_ours_confirm_the_sale(
    session, clock, gateway, user, reservation
):
    leave_pending(session, clock, gateway, user, reservation)
    clock.advance(PAST_THE_HOLD)

    summary = reconcile_payments(session, clock, gateway)

    assert summary == ReconcileSummary(settled=1, refunded=0)
    assert payment_of(session, reservation).status == PaymentStatus.APPROVED
    assert reservation_status(session, reservation) == ReservationStatus.PAID
    assert leg_expiries(session, reservation) == [None] * LEGS


def test_a_refund_that_failed_at_cancellation_is_retried(
    session, clock, gateway, user, reservation
):
    pay(session, clock, gateway, user, reservation)
    ref = payment_of(session, reservation).gateway_ref
    gateway.refund_fail_with = GatewayDown("refund failed")
    with pytest.raises(GatewayDown):
        cancel_reservation(session, clock, gateway, user.id, reservation.id)
    gateway.refund_fail_with = None
    assert payment_of(session, reservation).status == PaymentStatus.APPROVED

    summary = reconcile_payments(session, clock, gateway)

    assert summary == ReconcileSummary(settled=0, refunded=1)
    assert gateway.refunds == [ref, ref]
    assert payment_of(session, reservation).status == PaymentStatus.REFUNDED
    assert reservation_status(session, reservation) == ReservationStatus.CANCELLED


def test_settled_payments_are_not_touched_again(session, clock, gateway, user, reservation):
    pay(session, clock, gateway, user, reservation)
    clock.advance(timedelta(hours=1))

    summary = reconcile_payments(session, clock, gateway)

    assert summary == ReconcileSummary(settled=0, refunded=0)
    assert gateway.refunds == []
    assert payment_of(session, reservation).status == PaymentStatus.APPROVED
    assert reservation_status(session, reservation) == ReservationStatus.PAID


def test_a_refunded_payment_is_not_refunded_again(session, clock, gateway, user, reservation):
    pay(session, clock, gateway, user, reservation)
    cancel_reservation(session, clock, gateway, user.id, reservation.id)

    summary = reconcile_payments(session, clock, gateway)

    assert summary == ReconcileSummary(settled=0, refunded=0)
    assert len(gateway.refunds) == 1
    assert payment_of(session, reservation).status == PaymentStatus.REFUNDED


def test_a_payment_locked_by_another_reconciler_is_skipped(
    db_engine, session, clock, gateway, user, reservation
):
    leave_pending(session, clock, gateway, user, reservation)
    payment_id = payment_of(session, reservation).id
    clock.advance(MIN_PAYMENT_AGE)
    # Without SKIP LOCKED the second reconciler would wait; the 2 s lock_timeout turns
    # that wait into an error, so the test fails instead of hanging.
    impatient = create_engine(db_engine.url, connect_args={"options": "-c lock_timeout=2000"})
    try:
        with Session(db_engine) as holder, Session(impatient) as other:
            holder.execute(select(Payment).where(Payment.id == payment_id).with_for_update())

            summary = reconcile_payments(other, clock, gateway)

            holder.rollback()
    finally:
        impatient.dispose()

    assert summary == ReconcileSummary(settled=0, refunded=0)
    assert payment_of(session, reservation).status == PaymentStatus.PENDING


def test_batch_size_limits_how_many_are_settled(session, clock, gateway, user, trip, reservation):
    second = hold_seat(session, clock, user.id, trip.id, reservation.seat_number + 1)
    leave_pending(session, clock, gateway, user, reservation, key="key-1")
    leave_pending(session, clock, gateway, user, second, key="key-2")
    clock.advance(MIN_PAYMENT_AGE)

    summary = reconcile_payments(session, clock, gateway, batch_size=1)

    assert summary == ReconcileSummary(settled=1, refunded=0)
    assert sorted(session.scalars(select(Payment.status))) == ["approved", "pending"]
