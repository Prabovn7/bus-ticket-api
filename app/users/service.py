from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import EmailAlreadyRegistered
from app.core.security import hash_password
from app.users.models import User

UNIQUE_VIOLATION = "23505"


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
