from datetime import datetime

from pydantic import BaseModel, ConfigDict


class HoldIn(BaseModel):
    seat_number: int


class ReservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    trip_id: int
    seat_number: int
    origin_position: int
    destination_position: int
    status: str
    price_cents: int
    expires_at: datetime
