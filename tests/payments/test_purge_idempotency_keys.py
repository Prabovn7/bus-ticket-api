from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.payments.cleanup import IDEMPOTENCY_KEY_TTL, purge_idempotency_keys
from app.payments.models import IdempotencyKey


def add_key(session, clock, user, key, age, response_status=200):
    """Store a key as if it had been created `age` ago."""
    session.add(
        IdempotencyKey(
            user_id=user.id,
            key=key,
            request_hash="h" * 64,
            response_status=response_status,
            created_at=clock.now() - age,
        )
    )
    session.commit()


def remaining(session) -> list[str]:
    session.expire_all()
    return sorted(session.scalars(select(IdempotencyKey.key)))


def test_the_ttl_is_24_hours():
    assert IDEMPOTENCY_KEY_TTL == timedelta(hours=24)


def test_keys_older_than_the_ttl_are_deleted_and_recent_ones_kept(session, clock, user):
    add_key(session, clock, user, "old", timedelta(hours=25))
    add_key(session, clock, user, "recent", timedelta(hours=23))

    deleted = purge_idempotency_keys(session, clock)

    assert deleted == 1
    assert remaining(session) == ["recent"]


def test_a_key_exactly_at_the_limit_is_kept(session, clock, user):
    add_key(session, clock, user, "at-the-limit", IDEMPOTENCY_KEY_TTL)
    add_key(session, clock, user, "one-second-over", IDEMPOTENCY_KEY_TTL + timedelta(seconds=1))

    deleted = purge_idempotency_keys(session, clock)

    assert deleted == 1
    assert remaining(session) == ["at-the-limit"]


def test_an_old_key_still_in_progress_is_deleted_too(session, clock, user):
    add_key(session, clock, user, "stuck", timedelta(hours=25), response_status=None)

    deleted = purge_idempotency_keys(session, clock)

    assert deleted == 1
    assert remaining(session) == []


def test_keys_of_every_user_are_purged(session, clock, user, other_user):
    add_key(session, clock, user, "same-key", timedelta(hours=30))
    add_key(session, clock, other_user, "same-key", timedelta(hours=30))

    deleted = purge_idempotency_keys(session, clock)

    assert deleted == 2
    assert remaining(session) == []


def test_nothing_to_purge_returns_zero(session, clock, user):
    add_key(session, clock, user, "recent", timedelta(hours=1))

    assert purge_idempotency_keys(session, clock) == 0
    assert remaining(session) == ["recent"]


def test_the_max_age_can_be_changed(session, clock, user):
    add_key(session, clock, user, "two-hours", timedelta(hours=2))

    deleted = purge_idempotency_keys(session, clock, max_age=timedelta(hours=1))

    assert deleted == 1
    assert remaining(session) == []


def test_the_deletion_is_committed(db_engine, session, clock, user):
    add_key(session, clock, user, "old", timedelta(hours=25))

    purge_idempotency_keys(session, clock)

    with Session(db_engine) as other_connection:
        count = other_connection.scalar(select(func.count()).select_from(IdempotencyKey))
    assert count == 0
