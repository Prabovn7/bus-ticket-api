from pydantic import BaseModel

from app.payments.gateway import Scenario


class PayIn(BaseModel):
    scenario: Scenario = Scenario.APPROVE


class PaymentOut(BaseModel):
    payment_id: int
    status: str
    reservation_status: str
