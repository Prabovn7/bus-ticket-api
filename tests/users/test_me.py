from datetime import timedelta

import pytest

from app.core.security import create_access_token

URL = "/api/auth/me"


def test_me_returns_the_token_owner(client, user, token):
    response = client.get(URL, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {"id": user["id"], "email": "ana@x.com", "name": "Ana"}


def test_me_without_credentials_returns_401(client):
    response = client.get(URL)

    assert response.status_code == 401
    assert response.json()["code"] == "not_authenticated"
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "header",
    ["Bearer lixo", "Basic YW5hOnNlbmhh", "Token abc"],
    ids=["garbage-token", "wrong-scheme", "unknown-scheme"],
)
def test_me_with_invalid_credentials_returns_401(client, header):
    response = client.get(URL, headers={"Authorization": header})

    assert response.status_code == 401
    assert response.json()["code"] == "not_authenticated"


def test_me_with_expired_token_returns_401(client, user):
    expired = create_access_token(user["id"], expires_delta=timedelta(seconds=-1))

    response = client.get(URL, headers={"Authorization": f"Bearer {expired}"})

    assert response.status_code == 401


def test_me_with_token_of_a_nonexistent_user_returns_401(client):
    token = create_access_token(999999)

    response = client.get(URL, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
