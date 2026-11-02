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


def availability(client, *trip_ids):
    return client.get("/api/trips/availability", params={"trip_ids": list(trip_ids)})


def test_returns_the_count_without_login(client, trip):
    response = availability(client, trip.id)

    assert response.status_code == 200
    assert response.json() == [{"trip_id": trip.id, "capacity": 40, "free": 40}]


def test_a_hold_made_through_the_api_lowers_the_count(client, trip, headers):
    created = client.post(f"/api/trips/{trip.id}/holds", json={"seat_number": 7}, headers=headers)
    assert created.status_code == 201

    assert availability(client, trip.id).json()[0]["free"] == 39


def test_an_overdue_hold_does_not_count(client, clock, trip, headers):
    client.post(f"/api/trips/{trip.id}/holds", json={"seat_number": 7}, headers=headers)
    clock.advance(timedelta(minutes=10, seconds=1))

    assert availability(client, trip.id).json()[0]["free"] == 40


def test_unknown_trips_are_left_out(client, trip):
    response = availability(client, trip.id, 999)

    assert response.status_code == 200
    assert [a["trip_id"] for a in response.json()] == [trip.id]


def test_fifty_ids_are_accepted(client, trip):
    assert availability(client, *range(trip.id, trip.id + 50)).status_code == 200


def test_more_than_fifty_ids_return_422(client, trip):
    assert availability(client, *range(trip.id, trip.id + 51)).status_code == 422


def test_no_ids_return_422(client):
    assert availability(client).status_code == 422


def test_a_non_integer_id_returns_422(client):
    response = client.get("/api/trips/availability", params={"trip_ids": "abc"})

    assert response.status_code == 422
