"""Background process that expires overdue seat holds.

Run it next to the API:  python -m app.booking.expirer

The loop can also run extra tasks after each expiration (see Task). The booking
module knows nothing about what they do: app.worker wires in the payments jobs.
"""

import logging
import signal
import threading
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.booking.service import expire_holds
from app.core.clock import Clock, SystemClock
from app.core.db import SessionLocal

INTERVAL_SECONDS = 30.0
BATCH_SIZE = 100

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Task:
    """A named job the loop runs after each expiration. run returns how much work it did."""

    name: str
    run: Callable[[], int]


def expire_all_overdue(
    session_factory: Callable[[], Session], clock: Clock, batch_size: int = BATCH_SIZE
) -> int:
    """Expire batches until one comes back short, so a backlog drains in a single tick."""
    total = 0
    while True:
        with session_factory() as session:
            expired = expire_holds(session, clock, batch_size)
        total += expired
        if expired < batch_size:
            return total


def _wait(stop: threading.Event, seconds: float) -> None:
    # Wait in slices of at most one second so a stop request is noticed quickly
    # (on Windows a long Event.wait is not interrupted by Ctrl+C).
    deadline = time.monotonic() + seconds
    while True:
        remaining = deadline - time.monotonic()
        if stop.wait(min(max(remaining, 0.0), 1.0)) or remaining <= 1.0:
            return


def _run_task(task: Task, interval: float) -> None:
    try:
        done = task.run()
    except SQLAlchemyError:
        # Same rule as the expiration: database trouble is retried on the next tick,
        # and it never stops the tasks that come after this one.
        logger.exception("%s failed; retrying in %.0f s", task.name, interval)
    else:
        if done:
            logger.info("%s: %d done", task.name, done)


def run_expirer(
    session_factory: Callable[[], Session],
    clock: Clock,
    stop: threading.Event,
    interval: float = INTERVAL_SECONDS,
    batch_size: int = BATCH_SIZE,
    extra_tasks: Sequence[Task] = (),
) -> None:
    logger.info(
        "hold expirer started (every %.0f s, batch of %d, %d extra tasks)",
        interval,
        batch_size,
        len(extra_tasks),
    )
    while not stop.is_set():
        try:
            expired = expire_all_overdue(session_factory, clock, batch_size)
        except SQLAlchemyError:
            # Only database trouble is survivable: log it with the traceback and
            # try again on the next tick. Any other error is a bug and stops the process.
            logger.exception("hold expiration failed; retrying in %.0f s", interval)
        else:
            if expired:
                logger.info("expired %d overdue holds", expired)
        for task in extra_tasks:
            _run_task(task, interval)
        _wait(stop, interval)
    logger.info("hold expirer stopped")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    stop = threading.Event()
    for signum in (signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, lambda *_: stop.set())
    run_expirer(SessionLocal, SystemClock(), stop)


if __name__ == "__main__":
    main()
