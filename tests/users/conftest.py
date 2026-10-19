import pytest

PASSWORD = "senha-segura-1"


@pytest.fixture
def user(client):
    response = client.post(
        "/api/auth/register",
        json={"email": "ana@x.com", "password": PASSWORD, "name": "Ana"},
    )
    assert response.status_code == 201
    return {**response.json(), "password": PASSWORD}


@pytest.fixture
def token(client, user):
    response = client.post(
        "/api/auth/login",
        json={"email": user["email"], "password": user["password"]},
    )
    assert response.status_code == 200
    return response.json()["access_token"]
