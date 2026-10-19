import pytest

URL = "/api/auth/register"


def payload(**overrides):
    data = {"email": "ana@x.com", "password": "senha-segura-1", "name": "Ana"} | overrides
    return {key: value for key, value in data.items() if value is not None}


def test_register_returns_201_with_public_fields_only(client):
    response = client.post(URL, json=payload())

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"id", "email", "name"}
    assert body["email"] == "ana@x.com"
    assert body["name"] == "Ana"


def test_email_is_stored_in_lowercase(client):
    response = client.post(URL, json=payload(email="Ana@X.com"))

    assert response.status_code == 201
    assert response.json()["email"] == "ana@x.com"


def test_same_email_with_different_case_returns_409(client):
    assert client.post(URL, json=payload(email="A@x.com")).status_code == 201

    response = client.post(URL, json=payload(email="a@x.com"))

    assert response.status_code == 409
    assert response.json()["code"] == "email_already_registered"


@pytest.mark.parametrize("password", ["1234567", "x" * 129], ids=["7-chars", "129-chars"])
def test_password_outside_the_length_limits_returns_422(client, password):
    response = client.post(URL, json=payload(password=password))

    assert response.status_code == 422


@pytest.mark.parametrize("password", ["12345678", "x" * 128], ids=["8-chars", "128-chars"])
def test_password_at_the_limits_is_accepted(client, password):
    response = client.post(URL, json=payload(password=password))

    assert response.status_code == 201


def test_invalid_email_returns_422(client):
    response = client.post(URL, json=payload(email="isso-nao-e-email"))

    assert response.status_code == 422


@pytest.mark.parametrize("name", ["", None], ids=["blank", "missing"])
def test_blank_or_missing_name_returns_422(client, name):
    response = client.post(URL, json=payload(name=name))

    assert response.status_code == 422
