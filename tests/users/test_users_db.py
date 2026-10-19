import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.users.models import User


def test_register_stores_an_argon2_hash(client, session):
    client.post(
        "/api/auth/register",
        json={"email": "ana@x.com", "password": "senha-segura-1", "name": "Ana"},
    )

    user = session.scalar(select(User).where(User.email == "ana@x.com"))
    assert user is not None
    assert user.password_hash != "senha-segura-1"
    assert user.password_hash.startswith("$argon2")


def test_database_rejects_duplicate_email(session):
    session.add(User(email="ana@x.com", password_hash="hash", name="Ana"))
    session.flush()
    session.add(User(email="ana@x.com", password_hash="hash", name="Outra"))

    with pytest.raises(IntegrityError):
        session.flush()


def test_database_rejects_email_with_uppercase(session):
    session.add(User(email="Ana@x.com", password_hash="hash", name="Ana"))

    with pytest.raises(IntegrityError):
        session.flush()
