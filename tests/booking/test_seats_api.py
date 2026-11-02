from datetime import timedelta

import pytest

from app.core.clock import get_clock
from app.core.security import create_access_token


@pytest.fixture(autouse=True)
def fixed_clock(client, clock):
    client.app.dependency_overrides[get_clock] = lambda: clock


@pytest.fixture
def headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def seats(client, trip_id):
    return client.get(f"/api/trips/{trip_id}/seats")


def status_of(response, seat_number) -> str:
    return next(s["status"] for s in response.json()["seats"] if s["seat_number"] == seat_number)


def test_lists_every_seat_without_login(client, trip):
    response = seats(client, trip.id)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"trip_id", "capacity", "seats"}
    assert body["trip_id"] == trip.id
    assert body["capacity"] == trip.capacity == len(body["seats"]) == 40
    assert {s["status"] for s in body["seats"]} == {"free"}


def test_a_hold_made_through_the_api_shows_as_held(client, trip, headers):
    created = client.post(f"/api/trips/{trip.id}/holds", json={"seat_number": 7}, headers=headers)
    assert created.status_code == 201

    response = seats(client, trip.id)

    assert status_of(response, 7) == "held"
    assert status_of(response, 8) == "free"


def test_the_response_never_exposes_who_holds_the_seat(client, trip, headers):
    client.post(f"/api/trips/{trip.id}/holds", json={"seat_number": 7}, headers=headers)

    seat = next(s for s in seats(client, trip.id).json()["seats"] if s["seat_number"] == 7)

    assert set(seat) == {"seat_number", "status"}


def test_an_overdue_hold_shows_as_free(client, clock, trip, headers):
    client.post(f"/api/trips/{trip.id}/holds", json={"seat_number": 7}, headers=headers)
    clock.advance(timedelta(minutes=10, seconds=1))

    assert status_of(seats(client, trip.id), 7) == "free"


def test_unknown_trip_returns_404(client):
    response = seats(client, 999)

    assert response.status_code == 404
    assert response.json()["code"] == "trip_not_found"
