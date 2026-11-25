from datetime import UTC, datetime

import pytest
from sqlalchemy.exc import IntegrityError

from app.booking.models import Reservation
from app.catalog.models import Route, Trip
from app.payments.models import IdempotencyKey, Payment, PaymentStatus
from app.users.models import User

DEPARTURE = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)
EXPIRES = datetime(2026, 11, 20, 12, 10, tzinfo=UTC)


def make_user(session, email="ana@exemplo.com") -> User:
    user = User(email=email, password_hash="x" * 20, name="Ana")
    session.add(user)
    session.flush()
    return user


def make_reservation(session, user) -> Reservation:
    route = Route(name="SP-MG")
    session.add(route)
    session.flush()
    trip = Trip(route_id=route.id, departure_at=DEPARTURE)
    session.add(trip)
    session.flush()
    reservation = Reservation(
        user_id=user.id,
        trip_id=trip.id,
        seat_number=1,
        origin_position=1,
        destination_position=4,
        price_cents=7990,
        expires_at=EXPIRES,
    )
    session.add(reservation)
    session.flush()
    return reservation


def make_payment(session, reservation, **overrides) -> Payment:
    fields = {"reservation_id": reservation.id, "amount_cents": 7990}
    payment = Payment(**{**fields, **overrides})
    session.add(payment)
    session.flush()
    return payment


def test_payment_starts_pending(session):
    reservation = make_reservation(session, make_user(session))

    payment = make_payment(session, reservation)

    assert payment.status == PaymentStatus.PENDING
    assert payment.gateway_ref is None
    assert payment.created_at is not None


def test_payment_rejects_unknown_status(session):
    reservation = make_reservation(session, make_user(session))

    with pytest.raises(IntegrityError):
        make_payment(session, reservation, status="paid")


def test_payment_rejects_negative_amount(session):
    reservation = make_reservation(session, make_user(session))

    with pytest.raises(IntegrityError):
        make_payment(session, reservation, amount_cents=-1)


def test_payment_requires_an_existing_reservation(session):
    with pytest.raises(IntegrityError):
        session.add(Payment(reservation_id=999999, amount_cents=100))
        session.flush()


def test_new_idempotency_key_is_in_progress(session):
    user = make_user(session)
    key = IdempotencyKey(user_id=user.id, key="k1", request_hash="a" * 64)
    session.add(key)
    session.flush()

    assert key.response_status is None
    assert key.response_body is None
    assert key.created_at is not None


def test_same_user_cannot_reuse_a_key(session):
    user = make_user(session)
    session.add(IdempotencyKey(user_id=user.id, key="k1", request_hash="a" * 64))
    session.flush()

    with pytest.raises(IntegrityError):
        session.add(IdempotencyKey(user_id=user.id, key="k1", request_hash="b" * 64))
        session.flush()


def test_different_users_can_use_the_same_key(session):
    ana = make_user(session)
    bia = make_user(session, email="bia@exemplo.com")
    session.add(IdempotencyKey(user_id=ana.id, key="k1", request_hash="a" * 64))
    session.add(IdempotencyKey(user_id=bia.id, key="k1", request_hash="a" * 64))

    session.flush()
