from datetime import timedelta

import pytest

from app.payments.gateway import GatewayStatus, Scenario, SimulatedGateway, UnknownCharge


def test_scenarios_have_stable_names():
    assert [scenario.value for scenario in Scenario] == ["approve", "decline", "delay"]


def test_approve_scenario_is_approved_right_away(clock):
    gateway = SimulatedGateway(clock)

    result = gateway.charge(7990, Scenario.APPROVE)

    assert result.status == GatewayStatus.APPROVED
    assert result.ref
    assert gateway.get_status(result.ref) == GatewayStatus.APPROVED


def test_decline_scenario_is_declined_right_away(clock):
    gateway = SimulatedGateway(clock)

    result = gateway.charge(7990, Scenario.DECLINE)

    assert result.status == GatewayStatus.DECLINED
    assert gateway.get_status(result.ref) == GatewayStatus.DECLINED


def test_delay_scenario_stays_pending_until_the_delay_passes(clock):
    gateway = SimulatedGateway(clock, delay_seconds=30)

    result = gateway.charge(7990, Scenario.DELAY)

    assert result.status == GatewayStatus.PENDING
    assert gateway.get_status(result.ref) == GatewayStatus.PENDING
    clock.advance(timedelta(seconds=29))
    assert gateway.get_status(result.ref) == GatewayStatus.PENDING
    clock.advance(timedelta(seconds=1))
    assert gateway.get_status(result.ref) == GatewayStatus.APPROVED


def test_another_gateway_instance_resolves_the_same_charge(clock):
    first = SimulatedGateway(clock, delay_seconds=30)
    ref = first.charge(7990, Scenario.DELAY).ref
    clock.advance(timedelta(seconds=30))

    second = SimulatedGateway(clock, delay_seconds=30)

    assert second.get_status(ref) == GatewayStatus.APPROVED


def test_each_charge_gets_its_own_reference(clock):
    gateway = SimulatedGateway(clock)

    first = gateway.charge(7990, Scenario.APPROVE)
    second = gateway.charge(7990, Scenario.APPROVE)

    assert first.ref != second.ref


def test_unknown_reference_is_rejected(clock):
    gateway = SimulatedGateway(clock)

    with pytest.raises(UnknownCharge):
        gateway.get_status("not-a-simulated-reference")


def test_refund_accepts_a_known_reference(clock):
    gateway = SimulatedGateway(clock)
    ref = gateway.charge(7990, Scenario.APPROVE).ref

    assert gateway.refund(ref) is None


def test_refund_rejects_an_unknown_reference(clock):
    gateway = SimulatedGateway(clock)

    with pytest.raises(UnknownCharge):
        gateway.refund("not-a-simulated-reference")
