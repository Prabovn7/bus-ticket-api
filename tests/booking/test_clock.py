from datetime import timedelta

from app.core.clock import SystemClock


def test_system_clock_returns_an_aware_utc_datetime():
    now = SystemClock().now()
    assert now.tzinfo is not None
    assert now.utcoffset() == timedelta(0)
