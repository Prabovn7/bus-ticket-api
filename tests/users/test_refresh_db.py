import hashlib
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.security import generate_refresh_token, hash_refresh_token
from app.users.models import RefreshToken, User


def new_row(user_id: int, token_hash: str = "a" * 64) -> RefreshToken:
    return RefreshToken(
        user_id=user_id,
        family_id=uuid.uuid4(),
        token_hash=token_hash,
        expires_at=datetime.now(UTC) + timedelta(hours=1),
    )


@pytest.fixture
def db_user(session):
    user = User(email="ana@x.com", password_hash="hash", name="Ana")
    session.add(user)
    session.flush()
    return user


def test_generated_tokens_are_long_and_unique():
    first, second = generate_refresh_token(), generate_refresh_token()

    assert first != second
    assert len(first) >= 43


def test_hash_is_the_sha256_of_the_token():
    token = generate_refresh_token()

    digest = hash_refresh_token(token)

    assert digest == hashlib.sha256(token.encode()).hexdigest()
    assert digest != token


def test_database_rejects_duplicate_token_hash(session, db_user):
    session.add(new_row(db_user.id))
    session.flush()
    session.add(new_row(db_user.id))

    with pytest.raises(IntegrityError):
        session.flush()


def test_deleting_a_user_deletes_the_refresh_tokens(session, db_user):
    session.add(new_row(db_user.id))
    session.flush()

    session.delete(db_user)
    session.flush()

    assert session.scalar(select(func.count()).select_from(RefreshToken)) == 0
