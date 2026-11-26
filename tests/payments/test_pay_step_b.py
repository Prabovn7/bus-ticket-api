from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.booking.models import Reservation, ReservationStatus, SeatLeg
from app.booking.service import expire_holds, hold_seat
from app.payments.gateway import Scenario
from app.payments.models import Payment, PaymentStatus
from app.payments.reconciliation import reconcile_payments
from app.payments.service import pay_reservation

# Longer than the 60 s the payment guarantees, and longer than the 45 s a payment
# must wait before the reconciliation looks at it.
PAST_THE_PAYMENT_WINDOW = timedelta(seconds=61)
NEAR_THE_END_OF_THE_HOLD = timedelta(minutes=9, seconds=55)  # 5 s left on the 10-minute hold


def pay(session, clock, gateway, user, reservation, key="key-1", scenario=Scenario.APPROVE):
    return pay_reservation(session, clock, gateway, user.id, reservation.id, key, scenario)


def payment_of(session, reservation) -> Payment:
    session.expire_all()
    return session.scalars(select(Payment).where(Payment.reservation_id == reservation.id)).one()


def reservation_status(session, reservation) -> str:
    session.expire_all()
    return session.scalar(select(Reservation.status).where(Reservation.id == reservation.id))


def test_a_late_request_does_not_overwrite_what_the_reconciliation_resolved(
    db_engine, session, clock, gateway, user, reservation
):
    clock.advance(NEAR_THE_END_OF_THE_HOLD)

    def reconciliation_runs_while_charging():
        clock.advance(PAST_THE_PAYMENT_WINDOW)
        with Session(db_engine) as other:
            expire_holds(other, clock)
            reconcile_payments(other, clock, gateway)

    gateway.on_charge = reconciliation_runs_while_charging

    response = pay(session, clock, gateway, user, reservation)

    assert response.status_code == 409
    assert response.body["code"] == "payment_already_resolved"
    assert payment_of(session, reservation).status == PaymentStatus.REFUNDED
    assert reservation_status(session, reservation) == ReservationStatus.EXPIRED
    assert len(gateway.refunds) == 1
    assert pay(session, clock, gateway, user, reservation) == response  # the key replays it


def test_a_request_that_lost_its_seat_meanwhile_is_not_marked_paid(
    db_engine, session, clock, gateway, user, other_user, trip, reservation
):
    clock.advance(NEAR_THE_END_OF_THE_HOLD)
    seat = reservation.seat_number
    taken_by_someone_else: list[int] = []

    def someone_else_takes_the_seat_while_charging():
        clock.advance(PAST_THE_PAYMENT_WINDOW)
        with Session(db_engine) as other:
            taken_by_someone_else.append(hold_seat(other, clock, other_user.id, trip.id, seat).id)

    gateway.on_charge = someone_else_takes_the_seat_while_charging

    response = pay(session, clock, gateway, user, reservation)

    assert response.status_code == 409
    assert response.body["code"] == "seat_lost"
    assert payment_of(session, reservation).status == PaymentStatus.APPROVED
    assert reservation_status(session, reservation) == ReservationStatus.EXPIRED
    legs = session.scalars(
        select(SeatLeg).where(SeatLeg.trip_id == trip.id, SeatLeg.seat_number == seat)
    ).all()
    assert len(legs) == 3
    assert {leg.reservation_id for leg in legs} == set(taken_by_someone_else)
    assert all(leg.expires_at is not None for leg in legs)  # still the other buyer's hold

    summary = reconcile_payments(session, clock, gateway)

    assert summary.refunded == 1
    assert payment_of(session, reservation).status == PaymentStatus.REFUNDED
