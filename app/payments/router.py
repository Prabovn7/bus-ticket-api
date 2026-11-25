from typing import Annotated

from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse

from app.core.clock import Clock, get_clock
from app.payments import reads, service
from app.payments.gateway import PaymentGateway, SimulatedGateway
from app.payments.schemas import PayIn, ReservationDetailOut
from app.users.dependencies import CurrentUser, SessionDep

router = APIRouter(prefix="/api", tags=["payments"])

ClockDep = Annotated[Clock, Depends(get_clock)]


def get_gateway(clock: ClockDep) -> PaymentGateway:
    return SimulatedGateway(clock)


GatewayDep = Annotated[PaymentGateway, Depends(get_gateway)]


@router.get("/reservations", response_model=list[ReservationDetailOut])
def list_my_reservations(session: SessionDep, user: CurrentUser, clock: ClockDep):
    return reads.list_reservations(session, clock, user.id)


@router.get("/reservations/{reservation_id}", response_model=ReservationDetailOut)
def get_my_reservation(
    reservation_id: int, session: SessionDep, user: CurrentUser, clock: ClockDep
):
    return reads.get_reservation(session, clock, user.id, reservation_id)


@router.post("/reservations/{reservation_id}/pay")
def pay_reservation(
    reservation_id: int,
    body: PayIn,
    session: SessionDep,
    user: CurrentUser,
    clock: ClockDep,
    gateway: GatewayDep,
    idempotency_key: Annotated[str, Header(min_length=1, max_length=255)],
):
    result = service.pay_reservation(
        session, clock, gateway, user.id, reservation_id, idempotency_key, body.scenario
    )
    return JSONResponse(status_code=result.status_code, content=result.body)
