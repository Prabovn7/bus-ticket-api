from typing import Annotated

from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse

from app.core.clock import Clock, get_clock
from app.payments import service
from app.payments.gateway import PaymentGateway, SimulatedGateway
from app.payments.schemas import PayIn
from app.users.dependencies import CurrentUser, SessionDep

router = APIRouter(prefix="/api", tags=["payments"])

ClockDep = Annotated[Clock, Depends(get_clock)]


def get_gateway(clock: ClockDep) -> PaymentGateway:
    return SimulatedGateway(clock)


GatewayDep = Annotated[PaymentGateway, Depends(get_gateway)]


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
