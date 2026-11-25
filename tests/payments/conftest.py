import time
from collections.abc import Callable

import pytest

from app.booking.service import hold_seat
from app.core.clock import Clock
from app.payments.gateway import ChargeResult, Scenario, SimulatedGateway
from app.users.models import User

SEAT = 7


class FakeGateway(SimulatedGateway):
    """The simulated gateway, plus a record of every call and ways to misbehave.

    Set on_charge or on_refund to run code at the moment of the call (what a second
    connection sees, a retry arriving), latency to make the gateway slow, or
    fail_with and refund_fail_with to make it blow up.
    """

    def __init__(self, clock: Clock) -> None:
        super().__init__(clock)
        self.charges: list[tuple[int, Scenario]] = []
        self.refunds: list[str] = []
        self.on_charge: Callable[[], None] | None = None
        self.on_refund: Callable[[], None] | None = None
        self.latency: float = 0.0
        self.fail_with: Exception | None = None
        self.refund_fail_with: Exception | None = None

    def charge(self, amount_cents: int, scenario: Scenario) -> ChargeResult:
        self.charges.append((amount_cents, scenario))
        if self.on_charge is not None:
            self.on_charge()
        if self.latency:
            time.sleep(self.latency)
        if self.fail_with is not None:
            raise self.fail_with
        return super().charge(amount_cents, scenario)

    def refund(self, ref: str) -> None:
        self.refunds.append(ref)
        if self.on_refund is not None:
            self.on_refund()
        if self.latency:
            time.sleep(self.latency)
        if self.refund_fail_with is not None:
            raise self.refund_fail_with
        super().refund(ref)


@pytest.fixture
def gateway(clock):
    return FakeGateway(clock)


@pytest.fixture
def other_user(session):
    user = User(email="bia@exemplo.com", password_hash="x" * 20, name="Bia")
    session.add(user)
    session.commit()
    return user


@pytest.fixture
def reservation(session, clock, user, trip):
    return hold_seat(session, clock, user.id, trip.id, SEAT)
