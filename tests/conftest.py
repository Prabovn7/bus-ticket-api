from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import Session

from app.catalog.models import City, Route, RouteStop, Trip
from app.core.config import get_settings
from app.core.db import get_session
from app.main import create_app
from app.users.models import User

ROOT = Path(__file__).resolve().parent.parent

# Four stops, three legs: 2500 + 3000 + 2490 = 7990 for the full trip.
STOPS = [
    ("São Paulo", 0, 2500),
    ("Campinas", 60, 3000),
    ("Ribeirão Preto", 150, 2490),
    ("Uberaba", 240, None),
]


def _create_database_if_missing(admin_url: URL, name: str) -> None:
    engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        exists = conn.execute(
            text("select 1 from pg_database where datname = :name"), {"name": name}
        ).scalar()
        if not exists:
            conn.execute(text(f'create database "{name}"'))
    engine.dispose()


@pytest.fixture(scope="session")
def db_engine():
    base_url = make_url(get_settings().database_url)
    test_db = f"{base_url.database}_test"
    _create_database_if_missing(base_url.set(database="postgres"), test_db)
    test_url = base_url.set(database=test_db)

    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "migrations"))
    cfg.attributes["database_url"] = test_url.render_as_string(hide_password=False)
    command.upgrade(cfg, "head")

    engine = create_engine(test_url)
    yield engine
    engine.dispose()


@pytest.fixture
def session(db_engine):
    tables = [t for t in inspect(db_engine).get_table_names() if t != "alembic_version"]
    if tables:
        names = ", ".join(f'"{t}"' for t in tables)
        with db_engine.begin() as conn:
            conn.execute(text(f"truncate table {names} restart identity cascade"))
    with Session(db_engine) as session:
        yield session


@pytest.fixture
def client(session):
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def insecure_cookies_for_http_tests(monkeypatch):
    # The test client talks plain http, and cookie jars never send a Secure
    # cookie back over http. Production keeps the secure default.
    monkeypatch.setattr(get_settings(), "cookie_secure", False)


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
