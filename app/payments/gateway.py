"""Gateway de pagamento: interface e simulador sem estado."""

import uuid
from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol

from app.core.clock import Clock


class GatewayStatus(StrEnum):
    APPROVED = "approved"
    DECLINED = "declined"
    PENDING = "pending"


class Scenario(StrEnum):
    """Resultado que o simulador deve produzir para uma cobrança."""

    APPROVE = "approve"
    DECLINE = "decline"
    DELAY = "delay"


class UnknownCharge(Exception):
    """A referência não foi emitida por este gateway (ou está malformada)."""


@dataclass(frozen=True)
class ChargeResult:
    status: GatewayStatus
    ref: str


class PaymentGateway(Protocol):
    def charge(self, amount_cents: int, scenario: Scenario) -> ChargeResult: ...

    def get_status(self, ref: str) -> GatewayStatus: ...

    def refund(self, ref: str) -> None: ...


class SimulatedGateway:
    """Simulador sem estado: tudo que precisa saber vai dentro da gateway_ref.

    Formato da ref: sim-<scenario>-<epoch>-<uuid hex>
    """

    def __init__(self, clock: Clock, delay_seconds: int = 30) -> None:
        self._clock = clock
        self._delay_seconds = delay_seconds

    def charge(self, amount_cents: int, scenario: Scenario) -> ChargeResult:
        epoch = int(self._clock.now().timestamp())
        ref = f"sim-{scenario.value}-{epoch}-{uuid.uuid4().hex}"
        return ChargeResult(status=self.get_status(ref), ref=ref)

    def get_status(self, ref: str) -> GatewayStatus:
        scenario, epoch = self._parse(ref)
        if scenario is Scenario.APPROVE:
            return GatewayStatus.APPROVED
        if scenario is Scenario.DECLINE:
            return GatewayStatus.DECLINED
        now = self._clock.now().timestamp()
        if now >= epoch + self._delay_seconds:
            return GatewayStatus.APPROVED
        return GatewayStatus.PENDING

    def refund(self, ref: str) -> None:
        self._parse(ref)

    @staticmethod
    def _parse(ref: str) -> tuple[Scenario, int]:
        parts = ref.split("-", 3)
        if len(parts) != 4 or parts[0] != "sim":
            raise UnknownCharge(ref)
        try:
            return Scenario(parts[1]), int(parts[2])
        except ValueError as exc:
            raise UnknownCharge(ref) from exc
