import uuid
from datetime import UTC, datetime, timedelta
from typing import NoReturn

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import EmailAlreadyRegistered, InvalidCredentials, NotAuthenticated
from app.core.security import (
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.users.models import RefreshToken, User

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


def issue_refresh_token(
    session: Session,
    user_id: int,
    *,
    family_id: uuid.UUID | None = None,
    lifetime: timedelta | None = None,
) -> str:
    """Create a refresh token and return the raw value. Only its hash is stored.

    Does not commit: the caller decides when the transaction ends.
    """
    raw_token = generate_refresh_token()
    if lifetime is None:
        lifetime = timedelta(hours=get_settings().refresh_expire_hours)
    session.add(
        RefreshToken(
            user_id=user_id,
            family_id=family_id or uuid.uuid4(),
            token_hash=hash_refresh_token(raw_token),
            expires_at=datetime.now(UTC) + lifetime,
        )
    )
    session.flush()
    return raw_token


def _revoke_family(session: Session, family_id: uuid.UUID, now: datetime) -> None:
    session.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
        .execution_options(synchronize_session=False)
    )


def _reject_unusable_token(session: Session, token_hash: str, now: datetime) -> NoReturn:
    row = session.execute(
        select(RefreshToken.family_id, RefreshToken.used_at).where(
            RefreshToken.token_hash == token_hash
        )
    ).one_or_none()
    if row is not None and row.used_at is not None:
        # A token that was already rotated came back: treat it as theft and
        # kill every token of that login.
        _revoke_family(session, row.family_id, now)
        session.commit()
    else:
        session.rollback()
    raise NotAuthenticated()


def rotate_refresh_token(session: Session, raw_token: str) -> tuple[User, str]:
    token_hash = hash_refresh_token(raw_token)
    now = datetime.now(UTC)

    # The database decides who may use the token: only one UPDATE can flip used_at.
    claimed = session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.used_at.is_(None),
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        )
        .values(used_at=now)
        .returning(RefreshToken.user_id, RefreshToken.family_id)
        .execution_options(synchronize_session=False)
    ).one_or_none()
    if claimed is None:
        _reject_unusable_token(session, token_hash, now)

    user = session.get(User, claimed.user_id)
    if user is None:
        session.rollback()
        raise NotAuthenticated()
    new_token = issue_refresh_token(session, user.id, family_id=claimed.family_id)
    session.commit()
    return user, new_token


def revoke_refresh_session(session: Session, raw_token: str | None) -> None:
    if not raw_token:
        return
    family_id = session.scalar(
        select(RefreshToken.family_id).where(
            RefreshToken.token_hash == hash_refresh_token(raw_token)
        )
    )
    if family_id is not None:
        _revoke_family(session, family_id, datetime.now(UTC))
        session.commit()
