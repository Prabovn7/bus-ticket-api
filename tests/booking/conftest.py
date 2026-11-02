from datetime import UTC, datetime

import pytest

from app.catalog.models import City, Route, RouteStop, Trip
from app.users.models import User

# Four stops, three legs: 2500 + 3000 + 2490 = 7990 for the full trip.
STOPS = [
    ("São Paulo", 0, 2500),
    ("Campinas", 60, 3000),
    ("Ribeirão Preto", 150, 2490),
    ("Uberaba", 240, None),
]


class FakeClock:
    def __init__(self, start: datetime) -> None:
        self._now = start

    def now(self) -> datetime:
        return self._now

    def advance(self, delta) -> None:
        self._now += delta


@pytest.fixture
def clock():
    return FakeClock(datetime(2026, 11, 20, 12, 0, tzinfo=UTC))


@pytest.fixture
def user(session):
    user = User(email="ana@exemplo.com", password_hash="x" * 20, name="Ana")
    session.add(user)
    session.commit()
    return user


@pytest.fixture
def trip(session):
    route = Route(name="SP-Uberaba")
    session.add(route)
    session.flush()
    for position, (name, offset, price) in enumerate(STOPS, start=1):
        city = City(name=name, uf="SP")
        session.add(city)
        session.flush()
        session.add(
            RouteStop(
                route_id=route.id,
                position=position,
                city_id=city.id,
                offset_minutes=offset,
                price_to_next_cents=price,
            )
        )
    trip = Trip(route_id=route.id, departure_at=datetime(2026, 11, 21, 8, 0, tzinfo=UTC))
    session.add(trip)
    session.commit()
    return trip
