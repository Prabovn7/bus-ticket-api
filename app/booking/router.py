from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.booking import service
from app.booking.schemas import (
    HoldIn,
    ReservationOut,
    SeatMapOut,
    SeatOut,
    TripAvailabilityOut,
)
from app.core.clock import Clock, get_clock
from app.users.dependencies import CurrentUser, SessionDep

router = APIRouter(prefix="/api", tags=["booking"])

ClockDep = Annotated[Clock, Depends(get_clock)]


@router.post("/trips/{trip_id}/holds", response_model=ReservationOut, status_code=201)
def create_hold(
    trip_id: int, body: HoldIn, session: SessionDep, user: CurrentUser, clock: ClockDep
):
    return service.hold_seat(session, clock, user.id, trip_id, body.seat_number)


@router.get("/trips/availability", response_model=list[TripAvailabilityOut])
def trips_availability(
    session: SessionDep,
    clock: ClockDep,
    trip_ids: Annotated[list[int], Query(min_length=1, max_length=50)],
):
    return service.free_seat_counts(session, clock, trip_ids)


@router.get("/trips/{trip_id}/seats", response_model=SeatMapOut)
def list_seats(trip_id: int, session: SessionDep, clock: ClockDep):
    seats = service.seat_statuses(session, clock, trip_id)
    return SeatMapOut(
        trip_id=trip_id,
        capacity=len(seats),
        seats=[SeatOut(seat_number=s.seat_number, status=s.status) for s in seats],
    )
