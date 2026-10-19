from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    uf: str


class TripResult(BaseModel):
    trip_id: int
    departure_at: datetime
    arrival_at: datetime
    price_cents: int
    capacity: int
