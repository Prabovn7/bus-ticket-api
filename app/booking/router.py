from typing import Annotated

from fastapi import APIRouter, Depends

from app.booking import service
from app.booking.schemas import HoldIn, ReservationOut
from app.core.clock import Clock, get_clock
from app.users.dependencies import CurrentUser, SessionDep

router = APIRouter(prefix="/api", tags=["booking"])

ClockDep = Annotated[Clock, Depends(get_clock)]


@router.post("/trips/{trip_id}/holds", response_model=ReservationOut, status_code=201)
def create_hold(
    trip_id: int, body: HoldIn, session: SessionDep, user: CurrentUser, clock: ClockDep
):
    return service.hold_seat(session, clock, user.id, trip_id, body.seat_number)
