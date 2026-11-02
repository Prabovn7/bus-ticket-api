from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.booking.models import Reservation, SeatLeg
from app.core.clock import get_clock
from app.core.security import create_access_token

SEAT = 7


@pytest.fixture(autouse=True)
def fixed_clock(client, clock):
    client.app.dependency_overrides[get_clock] = lambda: clock


@pytest.fixture
def headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def hold(client, trip, headers=None, **body):
    return client.post(
        f"/api/trips/{trip.id}/holds", json={"seat_number": SEAT, **body}, headers=headers
    )


def count(session, model) -> int:
    return session.scalar(select(func.count()).select_from(model))


def test_hold_returns_201_with_the_reservation(client, clock, trip, headers):
    response = hold(client, trip, headers)

    assert response.status_code == 201
    body = response.json()
    assert body["id"] > 0
    assert body["trip_id"] == trip.id
    assert body["seat_number"] == SEAT
    assert (body["origin_position"], body["destination_position"]) == (1, 4)
    assert body["status"] == "held"
    assert body["price_cents"] == 7990
    assert datetime.fromisoformat(body["expires_at"]) == clock.now() + timedelta(minutes=10)


def test_hold_returns_the_seconds_left_on_the_server_clock(client, clock, trip, headers):
    response = hold(client, trip, headers)

    assert response.status_code == 201
    assert response.json()["expires_in_seconds"] == 600


def test_hold_requires_login(client, session, trip):
    response = hold(client, trip)

    assert response.status_code == 401
    assert response.json()["code"] == "not_authenticated"
    assert count(session, Reservation) == 0


def test_taken_seat_returns_409_without_leaking_the_other_reservation(client, trip, headers):
    first = hold(client, trip, headers)
    assert first.status_code == 201

    second = hold(client, trip, headers)

    assert second.status_code == 409
    assert set(second.json()) == {"code", "message"}
    assert second.json()["code"] == "seat_unavailable"


def test_unknown_trip_returns_404(client, headers):
    response = client.post("/api/trips/999/holds", json={"seat_number": SEAT}, headers=headers)

    assert response.status_code == 404
    assert response.json()["code"] == "trip_not_found"


def test_seat_outside_the_capacity_returns_422(client, session, trip, headers):
    response = hold(client, trip, headers, seat_number=41)

    assert response.status_code == 422
    assert response.json()["code"] == "invalid_seat"
    assert count(session, SeatLeg) == 0


def test_missing_seat_number_returns_422(client, trip, headers):
    response = client.post(f"/api/trips/{trip.id}/holds", json={}, headers=headers)

    assert response.status_code == 422
    assert "detail" in response.json()


def test_reservation_always_belongs_to_the_logged_in_user(client, session, user, trip, headers):
    response = hold(client, trip, headers, user_id=999)

    assert response.status_code == 201
    reservation = session.get(Reservation, response.json()["id"])
    assert reservation.user_id == user.id
