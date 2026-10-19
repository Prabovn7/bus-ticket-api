from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.catalog.models import City
from scripts.seed import seed

FIRST_DAY = date(2026, 10, 20)


@pytest.fixture(autouse=True)
def seeded(session):
    seed(session, start=FIRST_DAY)


def city_id(session, name: str) -> int:
    return session.scalar(select(City.id).where(City.name == name))


def search(client, session, origin: str, destination: str, day: str):
    return client.get(
        "/api/trips",
        params={
            "origin": city_id(session, origin),
            "destination": city_id(session, destination),
            "date": day,
        },
    )


def departures(response) -> set[datetime]:
    assert response.status_code == 200
    return {datetime.fromisoformat(item["departure_at"]) for item in response.json()}


def test_price_is_the_sum_of_the_legs(client, session):
    # São Paulo to Ribeirão Preto: 3500 + 6000
    response = search(client, session, "São Paulo", "Ribeirão Preto", "2026-10-20")

    assert response.status_code == 200
    assert [item["price_cents"] for item in response.json()] == [9500, 9500]


def test_price_starts_at_the_origin_stop(client, session):
    # Campinas to Uberaba: 6000 + 5500
    response = search(client, session, "Campinas", "Uberaba", "2026-10-21")

    assert response.status_code == 200
    assert {item["price_cents"] for item in response.json()} == {11500}


def test_arrival_is_departure_plus_the_stop_offsets(client, session):
    response = search(client, session, "São Paulo", "Ribeirão Preto", "2026-10-20")

    assert len(response.json()) == 2
    for item in response.json():
        departure = datetime.fromisoformat(item["departure_at"])
        arrival = datetime.fromisoformat(item["arrival_at"])
        assert arrival - departure == timedelta(minutes=270)


def test_result_fields_and_capacity(client, session):
    response = search(client, session, "São Paulo", "Uberaba", "2026-10-20")

    assert response.status_code == 200
    assert set(response.json()[0]) == {
        "trip_id",
        "departure_at",
        "arrival_at",
        "price_cents",
        "capacity",
    }
    assert [item["capacity"] for item in response.json()] == [40, 40]


def test_night_trip_belongs_to_the_local_day(client, session):
    # 23:00 in São Paulo on the 20th is 02:00 UTC on the 21st
    response = search(client, session, "São Paulo", "Uberaba", "2026-10-20")

    assert departures(response) == {
        datetime(2026, 10, 20, 11, 0, tzinfo=UTC),
        datetime(2026, 10, 21, 2, 0, tzinfo=UTC),
    }


def test_day_is_the_departure_day_from_the_origin_stop(client, session):
    # The 23:00 trip of the 20th leaves Campinas at 00:30 local time on the 21st
    on_20 = search(client, session, "Campinas", "Uberaba", "2026-10-20")
    on_21 = search(client, session, "Campinas", "Uberaba", "2026-10-21")

    assert departures(on_20) == {datetime(2026, 10, 20, 12, 30, tzinfo=UTC)}
    assert departures(on_21) == {
        datetime(2026, 10, 21, 3, 30, tzinfo=UTC),
        datetime(2026, 10, 21, 12, 30, tzinfo=UTC),
    }


@pytest.mark.parametrize("day", ["2026-10-19", "2026-10-27"])
def test_trips_of_other_days_do_not_appear(client, session, day):
    response = search(client, session, "São Paulo", "Uberaba", day)

    assert response.status_code == 200
    assert response.json() == []


def test_destination_before_origin_returns_empty_list(client, session):
    response = search(client, session, "Ribeirão Preto", "São Paulo", "2026-10-20")

    assert response.status_code == 200
    assert response.json() == []


def test_same_origin_and_destination_is_invalid(client, session):
    response = search(client, session, "Campinas", "Campinas", "2026-10-20")

    assert response.status_code == 422
    assert response.json()["code"] == "invalid_search"


@pytest.mark.parametrize("unknown", ["origin", "destination"])
def test_unknown_city_returns_404(client, session, unknown):
    params = {
        "origin": city_id(session, "São Paulo"),
        "destination": city_id(session, "Uberaba"),
        "date": "2026-10-20",
    }
    params[unknown] = 9999
    response = client.get("/api/trips", params=params)

    assert response.status_code == 404
    assert response.json()["code"] == "city_not_found"


def test_invalid_date_returns_422(client, session):
    response = search(client, session, "São Paulo", "Uberaba", "abc")

    assert response.status_code == 422


def test_list_cities_sorted_by_name(client):
    response = client.get("/api/cities")

    assert response.status_code == 200
    names = [city["name"] for city in response.json()]
    assert names == ["Campinas", "Ribeirão Preto", "São Paulo", "Uberaba"]
    assert set(response.json()[0]) == {"id", "name", "uf"}
