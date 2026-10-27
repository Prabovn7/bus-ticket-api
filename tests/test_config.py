from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings

ROOT = Path(__file__).resolve().parent.parent


def example_value(name: str) -> str:
    for line in (ROOT / ".env.example").read_text(encoding="utf-8").splitlines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1]
    raise AssertionError(f"{name} is missing from .env.example")


def test_database_url_is_built_from_parts():
    settings = Settings(
        _env_file=None,
        postgres_user="user",
        postgres_password="p@ss",
        postgres_db="db",
        jwt_secret="x" * 32,
    )
    assert settings.database_url == "postgresql+psycopg://user:p%40ss@localhost:5432/db"


def test_example_jwt_secret_is_rejected_until_replaced():
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            postgres_user="u",
            postgres_password="p",
            postgres_db="d",
            jwt_secret=example_value("JWT_SECRET"),
        )


def test_refresh_cookie_is_secure_by_default():
    settings = Settings(
        _env_file=None,
        postgres_user="u",
        postgres_password="p",
        postgres_db="d",
        jwt_secret="x" * 32,
    )

    assert settings.cookie_secure is True
