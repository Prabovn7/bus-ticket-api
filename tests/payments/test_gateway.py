from datetime import timedelta

import pytest

from app.payments.gateway import GatewayStatus, Scenario, SimulatedGateway, UnknownCharge


def test_scenarios_have_stable_names():
    assert [scenario.value for scenario in Scenario] == ["approve", "decline", "delay"]


def test_approve_scenario_is_approved_right_away(clock):
    gateway = SimulatedGateway(clock)
    ref = gateway.new_reference(Scenario.APPROVE)

    status = gateway.charge(ref, 7990)

    assert status == GatewayStatus.APPROVED
    assert gateway.get_status(ref) == GatewayStatus.APPROVED


def test_decline_scenario_is_declined_right_away(clock):
    gateway = SimulatedGateway(clock)
    ref = gateway.new_reference(Scenario.DECLINE)

    status = gateway.charge(ref, 7990)

    assert status == GatewayStatus.DECLINED
    assert gateway.get_status(ref) == GatewayStatus.DECLINED


def test_delay_scenario_stays_pending_until_the_delay_passes(clock):
    gateway = SimulatedGateway(clock, delay_seconds=30)
    ref = gateway.new_reference(Scenario.DELAY)

    assert gateway.charge(ref, 7990) == GatewayStatus.PENDING
    assert gateway.get_status(ref) == GatewayStatus.PENDING
    clock.advance(timedelta(seconds=29))
    assert gateway.get_status(ref) == GatewayStatus.PENDING
    clock.advance(timedelta(seconds=1))
    assert gateway.get_status(ref) == GatewayStatus.APPROVED


def test_another_gateway_instance_resolves_the_same_charge(clock):
    first = SimulatedGateway(clock, delay_seconds=30)
    ref = first.new_reference(Scenario.DELAY)
    first.charge(ref, 7990)
    clock.advance(timedelta(seconds=30))

    second = SimulatedGateway(clock, delay_seconds=30)

    assert second.get_status(ref) == GatewayStatus.APPROVED


def test_each_new_reference_is_different(clock):
    gateway = SimulatedGateway(clock)

    first = gateway.new_reference(Scenario.APPROVE)
    second = gateway.new_reference(Scenario.APPROVE)

    assert first != second


def test_charging_the_same_reference_twice_gives_the_same_answer(clock):
    gateway = SimulatedGateway(clock)
    ref = gateway.new_reference(Scenario.DECLINE)

    first = gateway.charge(ref, 7990)
    second = gateway.charge(ref, 7990)

    assert first == second == GatewayStatus.DECLINED


def test_charge_rejects_an_unknown_reference(clock):
    gateway = SimulatedGateway(clock)

    with pytest.raises(UnknownCharge):
        gateway.charge("not-a-simulated-reference", 7990)


def test_unknown_reference_is_rejected(clock):
    gateway = SimulatedGateway(clock)

    with pytest.raises(UnknownCharge):
        gateway.get_status("not-a-simulated-reference")


def test_refund_accepts_a_known_reference(clock):
    gateway = SimulatedGateway(clock)
    ref = gateway.new_reference(Scenario.APPROVE)
    gateway.charge(ref, 7990)

    assert gateway.refund(ref) is None


def test_refund_rejects_an_unknown_reference(clock):
    gateway = SimulatedGateway(clock)

    with pytest.raises(UnknownCharge):
        gateway.refund("not-a-simulated-reference")
