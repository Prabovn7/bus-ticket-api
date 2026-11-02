import pytest

from app.booking.legs import legs_for


def test_full_trip_covers_every_leg():
    assert legs_for(1, 4) == [1, 2, 3]


def test_single_leg_trip():
    assert legs_for(2, 3) == [2]


def test_legs_are_in_ascending_order():
    legs = legs_for(1, 6)
    assert legs == sorted(legs)


@pytest.mark.parametrize(
    ("origin", "destination"),
    [(3, 3), (4, 2), (0, 2), (-1, 3)],
)
def test_invalid_positions_are_rejected(origin, destination):
    with pytest.raises(ValueError):
        legs_for(origin, destination)
