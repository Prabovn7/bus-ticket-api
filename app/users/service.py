from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import EmailAlreadyRegistered, InvalidCredentials
from app.core.security import hash_password, verify_password
from app.users.models import User

UNIQUE_VIOLATION = "23505"

# Real hash of a throwaway password. Used when the email does not exist, so the
# request spends the same time as a real login and does not reveal which emails exist.
_DUMMY_HASH = hash_password("senha-descartavel-sem-uso")


def register_user(session: Session, email: str, password: str, name: str) -> User:
    user = User(
        email=email.strip().lower(),
        password_hash=hash_password(password),
        name=name,
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        if getattr(exc.orig, "sqlstate", None) == UNIQUE_VIOLATION:
            raise EmailAlreadyRegistered() from exc
        raise
    return user


def authenticate(session: Session, email: str, password: str) -> User:
    user = session.scalar(select(User).where(User.email == email.strip().lower()))
    password_hash = user.password_hash if user is not None else _DUMMY_HASH
    password_ok = verify_password(password, password_hash)
    if user is None or not password_ok:
        raise InvalidCredentials()
    return user


def get_user(session: Session, user_id: int) -> User | None:
    return session.get(User, user_id)
