"""Background worker: expires overdue holds, reconciles payments, purges old keys.

Run it next to the API:  python -m app.worker

It is the only place that knows both the booking and the payments modules; the
loop itself (app.booking.expirer) just runs whatever tasks it is given.
"""

import logging
import signal
import threading
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.booking.expirer import Task, run_expirer
from app.core.clock import Clock, SystemClock
from app.core.db import SessionLocal
from app.payments.cleanup import purge_idempotency_keys
from app.payments.gateway import PaymentGateway, SimulatedGateway
from app.payments.reconciliation import reconcile_payments


def build_tasks(
    session_factory: Callable[[], Session], clock: Clock, gateway: PaymentGateway
) -> list[Task]:
    """The payment jobs that run after each hold expiration, in this order."""

    def reconcile() -> int:
        with session_factory() as session:
            summary = reconcile_payments(session, clock, gateway)
        return summary.settled + summary.refunded

    def purge() -> int:
        with session_factory() as session:
            return purge_idempotency_keys(session, clock)

    return [
        Task("payment reconciliation", reconcile),
        Task("idempotency key cleanup", purge),
    ]


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    clock = SystemClock()
    stop = threading.Event()
    for signum in (signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, lambda *_: stop.set())
    run_expirer(
        SessionLocal,
        clock,
        stop,
        extra_tasks=build_tasks(SessionLocal, clock, SimulatedGateway(clock)),
    )


if __name__ == "__main__":
    main()
