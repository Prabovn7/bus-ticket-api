from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from app.booking.models import ReservationStatus, SeatLeg
from app.booking.service import expire_holds, hold_seat
from app.core.errors import (
    HoldExpired,
    IdempotencyConflict,
    RequestInProgress,
    ReservationNotFound,
    ReservationNotPayable,
)
from app.payments.gateway import Scenario
from app.payments.models import IdempotencyKey, Payment, PaymentStatus
from app.payments.service import pay_reservation

OTHER_SEAT = 8
ATTEMPTS = 50
LATENCY = 0.3  # real seconds: the threads must overlap a slow gateway


class GatewayDown(Exception):
    pass


def count(session, model) -> int:
    return session.scalar(select(func.count()).select_from(model))


def pay(session, clock, gateway, user, reservation, key="key-1", scenario=Scenario.APPROVE):
    return pay_reservation(session, clock, gateway, user.id, reservation.id, key, scenario)


def watch_charge(gateway, db_engine, reservation_id) -> list[datetime]:
    """Make the gateway record what a second connection sees during charge().

    FOR UPDATE NOWAIT fails at once if the reservation row is still locked, which
    would mean the service holds a lock while it waits for the gateway.
    """
    seen: list[datetime] = []

    def observe() -> None:
        with Session(db_engine) as other:
            lock = text("select id from reservations where id = :id for update nowait")
            other.execute(lock, {"id": reservation_id})
            query = select(SeatLeg.expires_at).where(SeatLeg.reservation_id == reservation_id)
            seen.extend(other.scalars(query))

    gateway.on_charge = observe
    return seen


def test_approved_payment_marks_reservation_paid(session, clock, gateway, user, reservation):
    response = pay(session, clock, gateway, user, reservation)

    assert response.status_code == 200
    assert response.body["status"] == "approved"
    session.refresh(reservation)
    assert reservation.status == ReservationStatus.PAID
    payment = session.scalars(select(Payment)).one()
    assert payment.status == PaymentStatus.APPROVED
    assert payment.amount_cents == 7990
    assert payment.id == response.body["payment_id"]
    legs = session.scalars(select(SeatLeg).where(SeatLeg.reservation_id == reservation.id)).all()
    assert len(legs) == 3
    assert all(leg.expires_at is None for leg in legs)


def test_the_response_is_saved_under_the_key(session, clock, gateway, user, reservation):
    response = pay(session, clock, gateway, user, reservation)

    saved = session.get(IdempotencyKey, (user.id, "key-1"))
    assert saved.response_status == 200
    assert saved.response_body == response.body
    assert len(saved.request_hash) == 64


def test_declined_payment_keeps_the_hold(session, clock, gateway, user, reservation):
    response = pay(session, clock, gateway, user, reservation, scenario=Scenario.DECLINE)

    assert response.status_code == 402
    assert response.body["status"] == "declined"
    session.refresh(reservation)
    assert reservation.status == ReservationStatus.HELD
    payment = session.scalars(select(Payment)).one()
    assert payment.status == PaymentStatus.DECLINED
    legs = session.scalars(select(SeatLeg).where(SeatLeg.reservation_id == reservation.id)).all()
    assert all(leg.expires_at is not None for leg in legs)


def test_decline_can_be_retried_with_a_new_key(session, clock, gateway, user, reservation):
    declined = pay(session, clock, gateway, user, reservation, scenario=Scenario.DECLINE)
    approved = pay(session, clock, gateway, user, reservation, key="key-2")

    assert (declined.status_code, approved.status_code) == (402, 200)
    session.refresh(reservation)
    assert reservation.status == ReservationStatus.PAID
    assert sorted(session.scalars(select(Payment.status))) == ["approved", "declined"]
    assert len(gateway.charges) == 2


def test_delayed_payment_stays_pending(session, clock, gateway, user, reservation):
    response = pay(session, clock, gateway, user, reservation, scenario=Scenario.DELAY)

    assert response.status_code == 202
    assert response.body["status"] == "pending"
    session.refresh(reservation)
    assert reservation.status == ReservationStatus.HELD
    assert session.scalars(select(Payment)).one().status == PaymentStatus.PENDING
    assert len(gateway.charges) == 1


def test_same_key_and_body_replays_saved_response(session, clock, gateway, user, reservation):
    first = pay(session, clock, gateway, user, reservation)
    second = pay(session, clock, gateway, user, reservation)

    assert second == first
    assert len(gateway.charges) == 1
    assert count(session, Payment) == 1


def test_same_key_with_another_body_is_rejected(session, clock, gateway, user, reservation):
    pay(session, clock, gateway, user, reservation)

    with pytest.raises(IdempotencyConflict):
        pay(session, clock, gateway, user, reservation, scenario=Scenario.DECLINE)

    assert len(gateway.charges) == 1


def test_same_key_for_another_reservation_is_rejected(
    session, clock, gateway, trip, user, reservation
):
    other_reservation = hold_seat(session, clock, user.id, trip.id, OTHER_SEAT)
    pay(session, clock, gateway, user, reservation)

    with pytest.raises(IdempotencyConflict):
        pay(session, clock, gateway, user, other_reservation)

    assert len(gateway.charges) == 1


def test_the_same_key_from_two_users_is_independent(
    session, clock, gateway, trip, user, other_user, reservation
):
    other_reservation = hold_seat(session, clock, other_user.id, trip.id, OTHER_SEAT)

    first = pay(session, clock, gateway, user, reservation, key="abc-1")
    second = pay(session, clock, gateway, other_user, other_reservation, key="abc-1")

    assert (first.status_code, second.status_code) == (200, 200)
    assert len(gateway.charges) == 2
    assert count(session, IdempotencyKey) == 2


def test_same_key_during_the_first_request_is_refused(
    db_engine, session, clock, gateway, user, reservation
):
    user_id, reservation_id = user.id, reservation.id
    args = (clock, gateway, user_id, reservation_id, "key-1", Scenario.APPROVE)
    outcome = []

    def second_request_arrives():
        gateway.on_charge = None  # the retry must not trigger another retry
        with Session(db_engine) as other:
            # if a lock were still held, fail in 2 s instead of hanging the test
            other.execute(text("set local lock_timeout = '2s'"))
            try:
                pay_reservation(other, *args)
            except RequestInProgress:
                outcome.append("in_progress")

    gateway.on_charge = second_request_arrives

    response = pay_reservation(session, *args)

    assert response.status_code == 200
    assert outcome == ["in_progress"]
    assert len(gateway.charges) == 1


def test_no_lock_is_held_while_the_gateway_is_called(
    db_engine, session, clock, gateway, user, reservation
):
    seen = watch_charge(gateway, db_engine, reservation.id)

    pay(session, clock, gateway, user, reservation)

    assert len(seen) == 3  # the second connection read the legs, so nothing was locked


def test_hold_is_extended_while_the_gateway_works(
    db_engine, session, clock, gateway, user, reservation
):
    clock.advance(timedelta(minutes=9, seconds=55))  # 5 s left on the hold
    seen = watch_charge(gateway, db_engine, reservation.id)

    pay(session, clock, gateway, user, reservation)

    assert seen == [clock.now() + timedelta(seconds=60)] * 3


def test_extension_never_shortens_an_existing_hold(
    db_engine, session, clock, gateway, user, reservation
):
    original = reservation.expires_at  # 10 minutes left
    seen = watch_charge(gateway, db_engine, reservation.id)

    pay(session, clock, gateway, user, reservation)

    assert seen == [original] * 3


def test_expirer_leaves_a_reservation_that_is_being_paid(
    db_engine, session, clock, gateway, user, reservation
):
    clock.advance(timedelta(minutes=9, seconds=55))  # 5 s left on the hold
    expired_meanwhile = []

    def expirer_runs_while_charging():
        clock.advance(timedelta(seconds=10))  # the original hold is now over
        with Session(db_engine) as other:
            expired_meanwhile.append(expire_holds(other, clock))

    gateway.on_charge = expirer_runs_while_charging

    response = pay(session, clock, gateway, user, reservation)

    assert expired_meanwhile == [0]
    assert response.status_code == 200
    session.refresh(reservation)
    assert reservation.status == ReservationStatus.PAID
    legs = session.scalars(select(SeatLeg).where(SeatLeg.reservation_id == reservation.id)).all()
    assert len(legs) == 3
    assert all(leg.expires_at is None for leg in legs)


def test_expired_hold_is_refused_without_charging(session, clock, gateway, user, reservation):
    clock.advance(timedelta(minutes=10, seconds=1))

    with pytest.raises(HoldExpired):
        pay(session, clock, gateway, user, reservation)

    assert gateway.charges == []
    assert count(session, Payment) == 0
    assert count(session, IdempotencyKey) == 0
    session.refresh(reservation)
    assert reservation.status == ReservationStatus.HELD


def test_payment_works_at_the_expiry_instant(session, clock, gateway, user, reservation):
    clock.advance(timedelta(minutes=10))

    response = pay(session, clock, gateway, user, reservation)

    assert response.status_code == 200


def test_another_users_reservation_is_reported_as_not_found(
    session, clock, gateway, other_user, reservation
):
    with pytest.raises(ReservationNotFound):
        pay(session, clock, gateway, other_user, reservation)

    assert gateway.charges == []
    assert count(session, Payment) == 0


def test_unknown_reservation_is_reported_as_not_found(session, clock, gateway, user):
    with pytest.raises(ReservationNotFound):
        pay_reservation(session, clock, gateway, user.id, 999, "key-1", Scenario.APPROVE)

    assert gateway.charges == []


def test_a_paid_reservation_cannot_be_paid_again(session, clock, gateway, user, reservation):
    pay(session, clock, gateway, user, reservation, key="key-1")

    with pytest.raises(ReservationNotPayable):
        pay(session, clock, gateway, user, reservation, key="key-2")

    assert len(gateway.charges) == 1
    assert count(session, Payment) == 1


def test_gateway_failure_leaves_payment_pending_and_key_open(
    session, clock, gateway, user, reservation
):
    gateway.fail_with = GatewayDown("connection lost")

    with pytest.raises(GatewayDown):
        pay(session, clock, gateway, user, reservation)

    assert session.scalars(select(Payment)).one().status == PaymentStatus.PENDING
    assert session.get(IdempotencyKey, (user.id, "key-1")).response_status is None
    session.refresh(reservation)
    assert reservation.status == ReservationStatus.HELD

    gateway.fail_with = None
    with pytest.raises(RequestInProgress):  # a retry never charges twice
        pay(session, clock, gateway, user, reservation)
    assert len(gateway.charges) == 1


def test_concurrent_requests_with_one_key_charge_once(
    db_engine, session, clock, gateway, user, reservation
):
    user_id, reservation_id = user.id, reservation.id
    session.rollback()
    gateway.latency = LATENCY
    engine = create_engine(db_engine.url, pool_size=40, max_overflow=0)
    args = (clock, gateway, user_id, reservation_id, "key-1", Scenario.APPROVE)

    def attempt(_: int):
        with Session(engine) as own_session:
            try:
                return pay_reservation(own_session, *args)
            except RequestInProgress:
                return None

    with ThreadPoolExecutor(max_workers=ATTEMPTS) as pool:
        results = list(pool.map(attempt, range(ATTEMPTS)))
    engine.dispose()

    answers = [result for result in results if result is not None]
    assert answers  # at least the request that did the work
    assert all(answer == answers[0] for answer in answers)
    assert len(gateway.charges) == 1
    assert count(session, Payment) == 1
