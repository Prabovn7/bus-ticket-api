from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import Session

from app.core.config import get_settings

ROOT = Path(__file__).resolve().parent.parent


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
