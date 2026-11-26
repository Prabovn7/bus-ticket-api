import threading
from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.booking.expirer import run_expirer
from app.payments.gateway import Scenario
from app.payments.models import IdempotencyKey, Payment, PaymentStatus
from app.payments.reconciliation import MIN_PAYMENT_AGE
from app.payments.service import pay_reservation
from app.worker import build_tasks


class GatewayDown(Exception):
    pass


class OneTick(threading.Event):
    """A stop event that lets the loop run exactly one tick."""

    def wait(self, timeout=None) -> bool:
        self.set()
        return True


def leave_payment_pending(session, clock, gateway, user, reservation):
    """Pay, but lose the gateway's answer: the payment stays pending, with its reference."""
    gateway.fail_with = GatewayDown("connection lost")
    with pytest.raises(GatewayDown):
        pay_reservation(
            session, clock, gateway, user.id, reservation.id, "pay-key", Scenario.APPROVE
        )
    gateway.fail_with = None


def add_old_key(session, clock, user, key="old-key"):
    session.add(
        IdempotencyKey(
            user_id=user.id,
            key=key,
            request_hash="h" * 64,
            response_status=200,
            created_at=clock.now() - timedelta(hours=25),
        )
    )
    session.commit()


def payment_status(session) -> str:
    session.expire_all()
    return session.scalars(select(Payment)).one().status


def key_names(session) -> list[str]:
    session.expire_all()
    return sorted(session.scalars(select(IdempotencyKey.key)))


def test_the_worker_builds_the_payment_tasks_in_order(db_engine, clock, gateway):
    tasks = build_tasks(sessionmaker(bind=db_engine), clock, gateway)

    assert [task.name for task in tasks] == ["payment reconciliation", "idempotency key cleanup"]


def test_the_reconciliation_task_settles_and_reports_the_work_done(
    db_engine, session, clock, gateway, user, reservation
):
    leave_payment_pending(session, clock, gateway, user, reservation)
    clock.advance(MIN_PAYMENT_AGE)
    session.rollback()
    tasks = {task.name: task for task in build_tasks(sessionmaker(bind=db_engine), clock, gateway)}

    done = tasks["payment reconciliation"].run()

    assert done == 1
    assert payment_status(session) == PaymentStatus.APPROVED


def test_the_cleanup_task_purges_and_reports_the_work_done(
    db_engine, session, clock, gateway, user
):
    add_old_key(session, clock, user)
    tasks = {task.name: task for task in build_tasks(sessionmaker(bind=db_engine), clock, gateway)}

    done = tasks["idempotency key cleanup"].run()

    assert done == 1
    assert key_names(session) == []


def test_one_tick_of_the_loop_runs_both_tasks(
    db_engine, session, clock, gateway, user, reservation
):
    leave_payment_pending(session, clock, gateway, user, reservation)
    add_old_key(session, clock, user)
    clock.advance(MIN_PAYMENT_AGE)
    session.rollback()
    factory = sessionmaker(bind=db_engine)

    run_expirer(
        factory,
        clock,
        OneTick(),
        interval=0.01,
        extra_tasks=build_tasks(factory, clock, gateway),
    )

    assert payment_status(session) == PaymentStatus.APPROVED
    assert "old-key" not in key_names(session)
