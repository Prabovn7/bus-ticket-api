from datetime import timedelta

import pytest

from app.core.clock import get_clock
from app.core.security import create_access_token
from app.payments.gateway import Scenario
from app.payments.router import get_gateway
from app.payments.service import pay_reservation


@pytest.fixture(autouse=True)
def fixed_dependencies(client, clock, gateway):
    client.app.dependency_overrides[get_clock] = lambda: clock
    client.app.dependency_overrides[get_gateway] = lambda: gateway


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def pay(session, clock, gateway, user, reservation, scenario=Scenario.APPROVE):
    return pay_reservation(session, clock, gateway, user.id, reservation.id, "pay-key", scenario)


def cancel(client, reservation, headers=None):
    return client.post(f"/api/reservations/{reservation.id}/cancel", headers=headers)


def test_cancel_a_paid_reservation_returns_200_with_the_refund(
    client, session, clock, gateway, reservation, user
):
    pay(session, clock, gateway, user, reservation)

    response = cancel(client, reservation, auth(user))

    assert response.status_code == 200
    assert response.json() == {
        "reservation_id": reservation.id,
        "status": "cancelled",
        "refund_status": "refunded",
    }


def test_cancel_requires_login(client, reservation):
    response = cancel(client, reservation)

    assert response.status_code == 401
    assert response.json()["code"] == "not_authenticated"


def test_cancel_someone_elses_reservation_returns_404(client, reservation, other_user):
    response = cancel(client, reservation, auth(other_user))

    assert response.status_code == 404
    assert response.json()["code"] == "reservation_not_found"


def test_cancel_after_departure_returns_409(client, session, clock, gateway, reservation, user):
    pay(session, clock, gateway, user, reservation)
    clock.advance(timedelta(hours=21))

    response = cancel(client, reservation, auth(user))

    assert response.status_code == 409
    assert response.json()["code"] == "trip_already_departed"


def test_cancel_with_a_payment_in_review_returns_409(
    client, session, clock, gateway, reservation, user
):
    pay(session, clock, gateway, user, reservation, Scenario.DELAY)

    response = cancel(client, reservation, auth(user))

    assert response.status_code == 409
    assert response.json()["code"] == "payment_in_progress"
