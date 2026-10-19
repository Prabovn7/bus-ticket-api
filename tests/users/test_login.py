import pytest

from app.core.config import get_settings
from app.core.security import decode_access_token

URL = "/api/auth/login"


def test_login_returns_a_bearer_token(client, user):
    response = client.post(URL, json={"email": user["email"], "password": user["password"]})

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"access_token", "token_type", "expires_in"}
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == get_settings().jwt_expire_minutes * 60
    assert decode_access_token(body["access_token"]) == user["id"]


def test_login_ignores_email_case(client, user):
    response = client.post(URL, json={"email": "ANA@X.com", "password": user["password"]})

    assert response.status_code == 200


def test_wrong_password_returns_401(client, user):
    response = client.post(URL, json={"email": user["email"], "password": "senha-errada-1"})

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_credentials"


def test_unknown_email_gets_the_same_answer_as_wrong_password(client, user):
    wrong_password = client.post(URL, json={"email": user["email"], "password": "senha-errada-1"})
    unknown_email = client.post(URL, json={"email": "ninguem@x.com", "password": user["password"]})

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


def test_401_tells_the_client_which_scheme_to_use(client, user):
    response = client.post(URL, json={"email": user["email"], "password": "senha-errada-1"})

    assert response.headers["www-authenticate"] == "Bearer"


def test_unknown_email_still_runs_a_password_check(client, monkeypatch):
    calls = []

    def spy(password, password_hash):
        calls.append(password_hash)
        return False

    monkeypatch.setattr("app.users.service.verify_password", spy)

    response = client.post(URL, json={"email": "ninguem@x.com", "password": "qualquer-senha"})

    assert response.status_code == 401
    assert len(calls) == 1


@pytest.mark.parametrize(
    "body",
    [{"password": "senha-segura-1"}, {"email": "ana@x.com"}, {}],
    ids=["no-email", "no-password", "empty-body"],
)
def test_missing_fields_return_422(client, body):
    response = client.post(URL, json=body)

    assert response.status_code == 422
