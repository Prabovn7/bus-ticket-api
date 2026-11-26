import logging
import threading
from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from app.booking.expirer import Task, expire_all_overdue, run_expirer
from app.booking.models import Reservation, ReservationStatus, SeatLeg
from app.booking.service import hold_seat


class StopAfter(threading.Event):
    """A stop event that ends the loop after N waits, so tests never really sleep."""

    def __init__(self, waits: int) -> None:
        super().__init__()
        self._waits_left = waits

    def wait(self, timeout=None) -> bool:
        self._waits_left -= 1
        if self._waits_left <= 0:
            self.set()
        return self.is_set()


class RecordingTask:
    """An extra task that counts its calls and can fail with a chosen error."""

    def __init__(self, name: str, error: Exception | None = None, fail_times: int = 0) -> None:
        self.name = name
        self.calls = 0
        self._error = error
        self._failures_left = fail_times

    def run(self) -> int:
        self.calls += 1
        if self._error is not None and self._failures_left > 0:
            self._failures_left -= 1
            raise self._error
        return 0

    def as_task(self) -> Task:
        return Task(self.name, self.run)


def database_down() -> OperationalError:
    return OperationalError("SELECT 1", None, Exception("database is down"))


def hold_many(session, clock, trip_id, user_id, seats) -> list[int]:
    return [hold_seat(session, clock, user_id, trip_id, seat).id for seat in seats]


def statuses(session) -> list[str]:
    return list(session.scalars(select(Reservation.status).order_by(Reservation.id)))


def test_one_tick_drains_a_backlog_bigger_than_one_batch(db_engine, session, clock, trip, user):
    hold_many(session, clock, trip.id, user.id, range(1, 13))
    clock.advance(timedelta(minutes=11))
    session.rollback()

    expired = expire_all_overdue(sessionmaker(bind=db_engine), clock, batch_size=5)

    assert expired == 12
    assert statuses(session).count(ReservationStatus.EXPIRED) == 12
    assert session.scalar(select(func.count()).select_from(SeatLeg)) == 0


def test_the_loop_expires_overdue_holds_on_its_tick(db_engine, session, clock, trip, user):
    hold_many(session, clock, trip.id, user.id, [1, 2])
    clock.advance(timedelta(minutes=11))
    session.rollback()

    run_expirer(sessionmaker(bind=db_engine), clock, StopAfter(1), interval=30)

    assert statuses(session) == [ReservationStatus.EXPIRED, ReservationStatus.EXPIRED]


def test_the_loop_does_not_run_a_tick_when_already_asked_to_stop(db_engine):
    stop = threading.Event()
    stop.set()
    calls = []

    def factory():
        calls.append(1)
        return Session(db_engine)

    run_expirer(factory, None, stop, interval=30)

    assert calls == []


def test_a_database_failure_is_logged_and_the_next_tick_retries(
    db_engine, session, clock, trip, user, caplog
):
    hold_many(session, clock, trip.id, user.id, [1])
    clock.advance(timedelta(minutes=11))
    session.rollback()
    real_factory = sessionmaker(bind=db_engine)
    attempts = []

    def flaky_factory():
        attempts.append(1)
        if len(attempts) == 1:
            raise OperationalError("SELECT 1", None, Exception("database is down"))
        return real_factory()

    with caplog.at_level(logging.ERROR, logger="app.booking.expirer"):
        run_expirer(flaky_factory, clock, StopAfter(2), interval=0.01)

    assert "hold expiration failed" in caplog.text
    assert statuses(session) == [ReservationStatus.EXPIRED]


def test_an_unexpected_error_is_not_swallowed():
    def broken_factory():
        raise RuntimeError("bug in the expirer")

    with pytest.raises(RuntimeError, match="bug in the expirer"):
        run_expirer(broken_factory, None, StopAfter(1), interval=0.01)


def test_extra_tasks_run_on_every_tick(db_engine, session, clock):
    task = RecordingTask("cleanup")

    run_expirer(
        sessionmaker(bind=db_engine),
        clock,
        StopAfter(3),
        interval=0.01,
        extra_tasks=[task.as_task()],
    )

    assert task.calls == 3


def test_extra_tasks_run_after_the_expiration_in_the_same_tick(
    db_engine, session, clock, trip, user
):
    hold_many(session, clock, trip.id, user.id, [1])
    clock.advance(timedelta(minutes=11))
    session.rollback()
    seen = []

    def look() -> int:
        session.rollback()
        seen.append(statuses(session))
        return 0

    run_expirer(
        sessionmaker(bind=db_engine),
        clock,
        StopAfter(1),
        interval=0.01,
        extra_tasks=[Task("look", look)],
    )

    assert seen == [[ReservationStatus.EXPIRED]]


def test_extra_tasks_still_run_when_the_expiration_fails(clock, caplog):
    def broken_factory():
        raise database_down()

    task = RecordingTask("cleanup")

    with caplog.at_level(logging.ERROR, logger="app.booking.expirer"):
        run_expirer(
            broken_factory, clock, StopAfter(1), interval=0.01, extra_tasks=[task.as_task()]
        )

    assert "hold expiration failed" in caplog.text
    assert task.calls == 1


def test_a_failing_task_blocks_neither_the_expirer_nor_the_next_tasks(
    db_engine, session, clock, trip, user, caplog
):
    hold_many(session, clock, trip.id, user.id, [1])
    clock.advance(timedelta(minutes=11))
    session.rollback()
    broken = RecordingTask("reconciliation", error=database_down(), fail_times=99)
    healthy = RecordingTask("cleanup")

    with caplog.at_level(logging.ERROR, logger="app.booking.expirer"):
        run_expirer(
            sessionmaker(bind=db_engine),
            clock,
            StopAfter(1),
            interval=0.01,
            extra_tasks=[broken.as_task(), healthy.as_task()],
        )

    assert statuses(session) == [ReservationStatus.EXPIRED]
    assert healthy.calls == 1
    assert "reconciliation failed" in caplog.text


def test_a_failed_task_is_retried_on_the_next_tick(db_engine, session, clock):
    flaky = RecordingTask("reconciliation", error=database_down(), fail_times=1)

    run_expirer(
        sessionmaker(bind=db_engine),
        clock,
        StopAfter(2),
        interval=0.01,
        extra_tasks=[flaky.as_task()],
    )

    assert flaky.calls == 2


def test_an_unexpected_error_in_a_task_is_not_swallowed(db_engine, session, clock):
    buggy = RecordingTask("reconciliation", error=RuntimeError("bug in the task"), fail_times=1)
    after = RecordingTask("cleanup")

    with pytest.raises(RuntimeError, match="bug in the task"):
        run_expirer(
            sessionmaker(bind=db_engine),
            clock,
            StopAfter(1),
            interval=0.01,
            extra_tasks=[buggy.as_task(), after.as_task()],
        )

    assert after.calls == 0
