"""Housekeeping for the payments tables."""

from datetime import timedelta

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.payments.models import IdempotencyKey

IDEMPOTENCY_KEY_TTL = timedelta(hours=24)


def purge_idempotency_keys(
    session: Session, clock: Clock, max_age: timedelta = IDEMPOTENCY_KEY_TTL
) -> int:
    """Delete every key older than max_age, finished or still in progress.

    The 24 hours are the contract with clients: after that, a key is forgotten and
    can be reused. A key stuck "in progress" is what a crash leaves behind; its payment
    was already settled by the reconciliation, so keeping the key would only keep
    answering 409 to that (user, key) pair.
    """
    cutoff = clock.now() - max_age
    result = session.execute(delete(IdempotencyKey).where(IdempotencyKey.created_at < cutoff))
    session.commit()
    return result.rowcount
