from datetime import UTC, datetime, timedelta

import jwt
import pytest
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.core.errors import NotAuthenticated
from app.core.security import create_access_token, decode_access_token

OTHER_SECRET = "outro-segredo-com-mais-de-32-caracteres"


def future() -> datetime:
    return datetime.now(UTC) + timedelta(minutes=5)


def test_token_roundtrip_returns_the_user_id():
    assert decode_access_token(create_access_token(42)) == 42


def test_token_carries_the_expected_claims():
    settings = get_settings()

    claims = jwt.decode(create_access_token(42), settings.jwt_secret, algorithms=["HS256"])

    assert claims["sub"] == "42"
    assert claims["exp"] - claims["iat"] == settings.jwt_expire_minutes * 60


def test_expired_token_is_rejected():
    token = create_access_token(42, expires_delta=timedelta(seconds=-1))

    with pytest.raises(NotAuthenticated):
        decode_access_token(token)


def test_token_signed_with_another_secret_is_rejected():
    forged = jwt.encode({"sub": "42", "exp": future()}, OTHER_SECRET, algorithm="HS256")

    with pytest.raises(NotAuthenticated):
        decode_access_token(forged)


def test_unsigned_token_is_rejected():
    unsigned = jwt.encode({"sub": "42", "exp": future()}, None, algorithm="none")

    with pytest.raises(NotAuthenticated):
        decode_access_token(unsigned)


def test_token_without_subject_is_rejected():
    token = jwt.encode({"exp": future()}, get_settings().jwt_secret, algorithm="HS256")

    with pytest.raises(NotAuthenticated):
        decode_access_token(token)


def test_token_with_non_numeric_subject_is_rejected():
    token = jwt.encode(
        {"sub": "abc", "exp": future()}, get_settings().jwt_secret, algorithm="HS256"
    )

    with pytest.raises(NotAuthenticated):
        decode_access_token(token)


def test_garbage_is_rejected():
    with pytest.raises(NotAuthenticated):
        decode_access_token("isso.nao.e.jwt")


def test_short_jwt_secret_is_rejected():
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            postgres_user="u",
            postgres_password="p",
            postgres_db="d",
            jwt_secret="curto",
        )
