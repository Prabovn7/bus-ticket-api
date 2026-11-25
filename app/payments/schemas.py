from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.payments.gateway import Scenario


class PayIn(BaseModel):
    scenario: Scenario = Scenario.APPROVE


class PaymentOut(BaseModel):
    payment_id: int
    status: str
    reservation_status: str


class ReservationDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    trip_id: int
    seat_number: int
    origin_position: int
    destination_position: int
    status: str
    price_cents: int
    expires_at: datetime | None
    expires_in_seconds: int | None
    payment_status: str | None
