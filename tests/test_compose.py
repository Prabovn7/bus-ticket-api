from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent


def test_compose_publishes_ports_only_on_localhost():
    compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text(encoding="utf-8"))

    published = {
        name: service["ports"]
        for name, service in compose["services"].items()
        if "ports" in service
    }

    assert published, "expected at least one published port"
    for name, ports in published.items():
        for port in ports:
            message = f"{name} publishes {port} on every network interface"
            assert str(port).startswith("127.0.0.1:"), message
