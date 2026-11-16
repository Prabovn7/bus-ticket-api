from datetime import UTC, datetime

import pytest


class FakeClock:
    def __init__(self, start: datetime) -> None:
        self._now = start

    def now(self) -> datetime:
        return self._now

    def advance(self, delta) -> None:
        self._now += delta


@pytest.fixture
def clock():
    return FakeClock(datetime(2026, 11, 20, 12, 0, tzinfo=UTC))
