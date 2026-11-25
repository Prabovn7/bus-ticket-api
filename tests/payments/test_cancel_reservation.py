from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from app.booking.models import Reservation, SeatLeg
from app.booking.service import hold_seat
from app.core.errors import (
    PaymentInProgress,
    ReservationNotCancellable,
    ReservationNotFound,
    TripAlreadyDeparted,
)
from app.payments.gateway import Scenario
from app.payments.models import Payment
from app.payments.service import cancel_reservation, pay_reservation

SEAT = 7
LEGS = 3  # four stops, three legs
ATTEMPTS = 20
LATENCY = 0.3  # real seconds: the threads must overlap a slow gateway


class GatewayDown(Exception):
    pass


def pay(session, clock, gateway, user, reservation, scenario=Scenario.APPROVE):
    return pay_reservation(session, clock, gateway, user.id, reservation.id, "pay-key", scenario)


def cancel(session, clock, gateway, user, reservation):
    return cancel_reservation(session, clock, gateway, user.id, reservation.id)


def reservation_status(session, reservation_id) -> str:
    session.expire_all()
    return session.scalar(select(Reservation.status).where(Reservation.id == reservation_id))


def payment_status(session, reservation_id) -> str:
    session.expire_all()
    return session.scalar(select(Payment.status).where(Payment.reservation_id == reservation_id))


def legs(session, reservation_id) -> int:
    query = (
        select(func.count()).select_from(SeatLeg).where(SeatLeg.reservation_id == reservation_id)
    )
    return session.scalar(query)


def test_cancelling_a_hold_frees_the_seat_without_a_refund(
    session, clock, gateway, user, other_user, trip, reservation
):
    result = cancel(session, clock, gateway, user, reservation)

    assert (result.status, result.refund_status) == ("cancelled", "none")
    assert reservation_status(session, reservation.id) == "cancelled"
    assert legs(session, reservation.id) == 0
    assert gateway.refunds == []
    assert hold_seat(session, clock, other_user.id, trip.id, SEAT).status == "held"


def test_cancelling_a_paid_reservation_refunds_in_full(session, clock, gateway, user, reservation):
    pay(session, clock, gateway, user, reservation)
    ref = session.scalar(select(Payment.gateway_ref))

    result = cancel(session, clock, gateway, user, reservation)

    assert (result.status, result.refund_status) == ("cancelled", "refunded")
    assert reservation_status(session, reservation.id) == "cancelled"
    assert payment_status(session, reservation.id) == "refunded"
    assert legs(session, reservation.id) == 0
    assert gateway.refunds == [ref]


def test_cancelling_twice_returns_the_same_result_and_refunds_once(
    session, clock, gateway, user, reservation
):
    pay(session, clock, gateway, user, reservation)

    first = cancel(session, clock, gateway, user, reservation)
    second = cancel(session, clock, gateway, user, reservation)

    assert second == first
    assert len(gateway.refunds) == 1


def test_cancelling_a_cancelled_hold_is_a_replay(session, clock, gateway, user, reservation):
    first = cancel(session, clock, gateway, user, reservation)
    second = cancel(session, clock, gateway, user, reservation)

    assert second == first
    assert second.refund_status == "none"


def test_cancel_is_refused_after_the_trip_departed(session, clock, gateway, user, reservation):
    pay(session, clock, gateway, user, reservation)
    clock.advance(timedelta(hours=21))  # the trip leaves 20 h after the fixture clock

    with pytest.raises(TripAlreadyDeparted):
        cancel(session, clock, gateway, user, reservation)

    assert reservation_status(session, reservation.id) == "paid"
    assert gateway.refunds == []


def test_cancel_works_until_the_last_minute_before_departure(
    session, clock, gateway, user, reservation
):
    pay(session, clock, gateway, user, reservation)
    clock.advance(timedelta(hours=19, minutes=59))

    result = cancel(session, clock, gateway, user, reservation)

    assert result.refund_status == "refunded"


def test_cancel_is_refused_while_a_payment_is_in_review(session, clock, gateway, user, reservation):
    pay(session, clock, gateway, user, reservation, Scenario.DELAY)

    with pytest.raises(PaymentInProgress):
        cancel(session, clock, gateway, user, reservation)

    assert reservation_status(session, reservation.id) == "held"
    assert legs(session, reservation.id) == LEGS


def test_cancel_after_a_declined_payment_needs_no_refund(
    session, clock, gateway, user, reservation
):
    pay(session, clock, gateway, user, reservation, Scenario.DECLINE)

    result = cancel(session, clock, gateway, user, reservation)

    assert (result.status, result.refund_status) == ("cancelled", "none")
    assert payment_status(session, reservation.id) == "declined"
    assert gateway.refunds == []


def test_cancel_is_refused_for_an_expired_hold(session, clock, gateway, user, reservation):
    clock.advance(timedelta(minutes=11))

    with pytest.raises(ReservationNotCancellable):
        cancel(session, clock, gateway, user, reservation)


def test_cancel_someone_elses_reservation_is_not_found(
    session, clock, gateway, other_user, reservation
):
    with pytest.raises(ReservationNotFound):
        cancel(session, clock, gateway, other_user, reservation)

    assert reservation_status(session, reservation.id) == "held"


def test_cancel_unknown_reservation_is_not_found(session, clock, gateway, user):
    with pytest.raises(ReservationNotFound):
        cancel_reservation(session, clock, gateway, user.id, 999999)


def test_the_refund_runs_outside_any_transaction(
    db_engine, session, clock, gateway, user, reservation
):
    pay(session, clock, gateway, user, reservation)
    reservation_id = reservation.id
    session.rollback()
    seen: list[str] = []

    def observe() -> None:
        with Session(db_engine) as other:
            lock = text("select id from reservations where id = :id for update nowait")
            other.execute(lock, {"id": reservation_id})  # fails at once if still locked
            seen.extend(
                other.scalars(select(Reservation.status).where(Reservation.id == reservation_id))
            )

    gateway.on_refund = observe

    cancel_reservation(session, clock, gateway, user.id, reservation_id)

    assert seen == ["cancelled"]  # step A was committed before the gateway was called


def test_gateway_failure_keeps_the_cancellation_and_leaves_the_refund_for_later(
    session, clock, gateway, user, reservation
):
    pay(session, clock, gateway, user, reservation)
    gateway.refund_fail_with = GatewayDown()

    with pytest.raises(GatewayDown):
        cancel(session, clock, gateway, user, reservation)

    assert reservation_status(session, reservation.id) == "cancelled"
    assert payment_status(session, reservation.id) == "approved"
    assert legs(session, reservation.id) == 0

    gateway.refund_fail_with = None
    again = cancel(session, clock, gateway, user, reservation)

    assert (again.status, again.refund_status) == ("cancelled", "pending")
    assert len(gateway.refunds) == 1  # a replay does not retry; reconciliation will


def test_concurrent_cancellations_refund_once(
    db_engine, session, clock, gateway, user, reservation
):
    pay(session, clock, gateway, user, reservation)
    user_id, reservation_id = user.id, reservation.id
    session.rollback()
    gateway.latency = LATENCY
    engine = create_engine(db_engine.url, pool_size=ATTEMPTS, max_overflow=0)

    def attempt(_: int):
        with Session(engine) as own_session:
            return cancel_reservation(own_session, clock, gateway, user_id, reservation_id)

    with ThreadPoolExecutor(max_workers=ATTEMPTS) as pool:
        results = list(pool.map(attempt, range(ATTEMPTS)))
    engine.dispose()

    assert {result.status for result in results} == {"cancelled"}
    assert len(gateway.refunds) == 1
    assert payment_status(session, reservation_id) == "refunded"
