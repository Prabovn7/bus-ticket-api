from datetime import timedelta

import pytest
from sqlalchemy import select

from app.booking.models import Reservation
from app.booking.service import hold_seat
from app.core.clock import get_clock
from app.core.security import create_access_token
from app.payments.gateway import Scenario
from app.payments.service import pay_reservation


@pytest.fixture(autouse=True)
def fixed_clock(client, clock):
    client.app.dependency_overrides[get_clock] = lambda: clock


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def pay(session, clock, gateway, user, reservation, scenario):
    return pay_reservation(
        session, clock, gateway, user.id, reservation.id, f"key-{reservation.id}", scenario
    )


def test_get_returns_a_held_reservation(client, reservation, user):
    response = client.get(f"/api/reservations/{reservation.id}", headers=auth(user))

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == reservation.id
    assert body["status"] == "held"
    assert body["price_cents"] == 7990
    assert (body["origin_position"], body["destination_position"]) == (1, 4)
    assert body["expires_in_seconds"] == 600
    assert body["expires_at"] is not None
    assert body["payment_status"] is None


def test_get_returns_a_paid_reservation_without_a_countdown(
    client, session, clock, gateway, reservation, user
):
    pay(session, clock, gateway, user, reservation, Scenario.APPROVE)

    body = client.get(f"/api/reservations/{reservation.id}", headers=auth(user)).json()

    assert body["status"] == "paid"
    assert body["payment_status"] == "approved"
    assert body["expires_at"] is None
    assert body["expires_in_seconds"] is None


def test_get_shows_an_overdue_hold_as_expired_without_writing(
    client, session, clock, reservation, user
):
    clock.advance(timedelta(minutes=11))

    body = client.get(f"/api/reservations/{reservation.id}", headers=auth(user)).json()

    assert body["status"] == "expired"
    assert body["expires_in_seconds"] == 0
    session.expire_all()
    stored = session.scalar(select(Reservation.status).where(Reservation.id == reservation.id))
    assert stored == "held"  # a GET never writes: the expirer owns that cleanup


@pytest.mark.parametrize(
    ("scenario", "payment_status"),
    [(Scenario.DELAY, "pending"), (Scenario.DECLINE, "declined")],
)
def test_get_reports_the_latest_payment_status(
    client, session, clock, gateway, reservation, user, scenario, payment_status
):
    pay(session, clock, gateway, user, reservation, scenario)

    body = client.get(f"/api/reservations/{reservation.id}", headers=auth(user)).json()

    assert body["status"] == "held"
    assert body["payment_status"] == payment_status


def test_get_someone_elses_reservation_returns_404(client, reservation, other_user):
    response = client.get(f"/api/reservations/{reservation.id}", headers=auth(other_user))

    assert response.status_code == 404
    assert response.json()["code"] == "reservation_not_found"


def test_get_unknown_reservation_returns_404(client, user):
    response = client.get("/api/reservations/999999", headers=auth(user))

    assert response.status_code == 404
    assert response.json()["code"] == "reservation_not_found"


def test_get_requires_login(client, reservation):
    response = client.get(f"/api/reservations/{reservation.id}")

    assert response.status_code == 401
    assert response.json()["code"] == "not_authenticated"


def test_list_returns_only_my_reservations_newest_first(
    session, client, clock, reservation, user, other_user, trip
):
    second = hold_seat(session, clock, user.id, trip.id, 8)
    hold_seat(session, clock, other_user.id, trip.id, 9)

    response = client.get("/api/reservations", headers=auth(user))

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [second.id, reservation.id]


def test_list_shows_overdue_holds_as_expired(client, clock, reservation, user):
    clock.advance(timedelta(minutes=11))

    items = client.get("/api/reservations", headers=auth(user)).json()

    assert [item["status"] for item in items] == ["expired"]


def test_list_is_empty_when_there_are_no_reservations(client, user):
    response = client.get("/api/reservations", headers=auth(user))

    assert response.status_code == 200
    assert response.json() == []


def test_list_requires_login(client):
    response = client.get("/api/reservations")

    assert response.status_code == 401
    assert response.json()["code"] == "not_authenticated"
