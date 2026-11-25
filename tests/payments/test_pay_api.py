import pytest
from sqlalchemy import select

from app.booking.models import Reservation
from app.core.clock import get_clock
from app.core.security import create_access_token
from app.payments.models import Payment
from app.payments.router import get_gateway


@pytest.fixture(autouse=True)
def fixed_dependencies(client, clock, gateway):
    client.app.dependency_overrides[get_clock] = lambda: clock
    client.app.dependency_overrides[get_gateway] = lambda: gateway


@pytest.fixture
def headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def pay(client, reservation, headers=None, key="key-1", scenario="approve"):
    all_headers = dict(headers or {})
    if key is not None:
        all_headers["Idempotency-Key"] = key
    return client.post(
        f"/api/reservations/{reservation.id}/pay",
        json={"scenario": scenario},
        headers=all_headers,
    )


def reservation_status(session, reservation_id) -> str:
    session.expire_all()
    return session.scalar(select(Reservation.status).where(Reservation.id == reservation_id))


def test_pay_approved_returns_200_and_marks_the_reservation_paid(
    client, session, reservation, headers
):
    response = pay(client, reservation, headers)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "approved"
    assert body["reservation_status"] == "paid"
    assert body["payment_id"] > 0
    assert reservation_status(session, reservation.id) == "paid"


def test_pay_declined_returns_402_and_keeps_the_hold(client, session, reservation, headers):
    response = pay(client, reservation, headers, scenario="decline")

    assert response.status_code == 402
    assert response.json()["status"] == "declined"
    assert reservation_status(session, reservation.id) == "held"


def test_pay_delayed_returns_202_with_the_payment_pending(client, reservation, headers):
    response = pay(client, reservation, headers, scenario="delay")

    assert response.status_code == 202
    assert response.json()["status"] == "pending"


def test_pay_requires_the_idempotency_key_header(client, gateway, reservation, headers):
    response = pay(client, reservation, headers, key=None)

    assert response.status_code == 422
    assert gateway.charges == []


def test_pay_requires_login(client, gateway, reservation):
    response = pay(client, reservation)

    assert response.status_code == 401
    assert response.json()["code"] == "not_authenticated"
    assert gateway.charges == []


def test_pay_with_an_unknown_scenario_is_rejected(client, gateway, reservation, headers):
    response = pay(client, reservation, headers, scenario="explode")

    assert response.status_code == 422
    assert gateway.charges == []


def test_pay_someone_elses_reservation_returns_404(client, gateway, reservation, other_user):
    other = {"Authorization": f"Bearer {create_access_token(other_user.id)}"}

    response = pay(client, reservation, other)

    assert response.status_code == 404
    assert response.json()["code"] == "reservation_not_found"
    assert gateway.charges == []


def test_same_key_replays_the_saved_response_without_charging_again(
    client, session, gateway, reservation, headers
):
    first = pay(client, reservation, headers)
    second = pay(client, reservation, headers)

    assert second.status_code == first.status_code == 200
    assert second.json() == first.json()
    assert len(gateway.charges) == 1
    assert len(session.scalars(select(Payment)).all()) == 1


def test_same_key_with_another_scenario_returns_422(client, gateway, reservation, headers):
    pay(client, reservation, headers, scenario="approve")

    response = pay(client, reservation, headers, scenario="decline")

    assert response.status_code == 422
    assert response.json()["code"] == "idempotency_key_reused"
    assert len(gateway.charges) == 1
