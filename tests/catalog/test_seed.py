from datetime import date

from sqlalchemy import func, select

from app.catalog.models import City, Route, RouteStop, Trip
from scripts.seed import seed

MODELS = (City, Route, RouteStop, Trip)


def counts(session) -> dict[str, int]:
    return {
        model.__name__: session.scalar(select(func.count()).select_from(model)) for model in MODELS
    }


def test_seed_twice_does_not_duplicate(session):
    seed(session, start=date(2026, 10, 20))
    first = counts(session)
    seed(session, start=date(2026, 10, 20))
    second = counts(session)

    assert first == {"City": 4, "Route": 1, "RouteStop": 4, "Trip": 14}
    assert second == first
