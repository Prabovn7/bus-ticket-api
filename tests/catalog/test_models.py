from datetime import UTC, datetime

import pytest
from sqlalchemy.exc import IntegrityError

from app.catalog.models import City, Route, RouteStop, Trip

DEPARTURE = datetime(2026, 10, 20, 12, 0, tzinfo=UTC)


def make_city(session, name="São Paulo", uf="SP") -> City:
    city = City(name=name, uf=uf)
    session.add(city)
    session.flush()
    return city


def make_route(session) -> Route:
    route = Route(name="SP-MG")
    session.add(route)
    session.flush()
    return route


def make_stop(route, position, city, price, offset=0) -> RouteStop:
    return RouteStop(
        route_id=route.id,
        position=position,
        city_id=city.id,
        offset_minutes=offset,
        price_to_next_cents=price,
    )


def test_valid_catalog_rows_are_accepted(session):
    sp = make_city(session)
    campinas = make_city(session, name="Campinas")
    route = make_route(session)
    session.add_all(
        [
            make_stop(route, 1, sp, 2500),
            make_stop(route, 2, campinas, None, offset=90),
        ]
    )
    trip = Trip(route_id=route.id, departure_at=DEPARTURE)
    session.add(trip)
    session.flush()
    assert trip.capacity == 40


def test_duplicate_city_name_and_uf_is_rejected(session):
    make_city(session)
    session.add(City(name="São Paulo", uf="SP"))
    with pytest.raises(IntegrityError):
        session.flush()


def test_same_city_twice_in_same_route_is_rejected(session):
    sp = make_city(session)
    route = make_route(session)
    session.add_all(
        [
            make_stop(route, 1, sp, 2500),
            make_stop(route, 2, sp, None, offset=90),
        ]
    )
    with pytest.raises(IntegrityError):
        session.flush()


def test_trip_capacity_must_be_positive(session):
    route = make_route(session)
    session.add(Trip(route_id=route.id, departure_at=DEPARTURE, capacity=0))
    with pytest.raises(IntegrityError):
        session.flush()


def test_negative_price_is_rejected(session):
    sp = make_city(session)
    route = make_route(session)
    session.add(make_stop(route, 1, sp, -1))
    with pytest.raises(IntegrityError):
        session.flush()
