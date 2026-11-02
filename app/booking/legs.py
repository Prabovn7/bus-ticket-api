def legs_for(origin_position: int, destination_position: int) -> list[int]:
    """Legs a trip between two stops crosses, in ascending order.

    Stops are numbered from 1 and leg k links stop k to stop k + 1, so a ride
    from stop 1 to stop 4 crosses legs 1, 2 and 3.
    """
    if origin_position < 1 or origin_position >= destination_position:
        raise ValueError("origin must be at least 1 and come before destination")
    return list(range(origin_position, destination_position))
