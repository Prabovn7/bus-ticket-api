from datetime import timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import decode_access_token, hash_refresh_token
from app.users.models import RefreshToken
from app.users.service import issue_refresh_token

REFRESH = "/api/auth/refresh"
LOGOUT = "/api/auth/logout"
COOKIE = "refresh_token"


def set_cookie_header(response) -> str:
    return "; ".join(response.headers.get_list("set-cookie")).lower()


def use_refresh_token(client, value: str) -> None:
    client.cookies.clear()
    client.cookies.set(COOKIE, value)


def test_login_sets_a_hardened_refresh_cookie(login):
    header = set_cookie_header(login())

    assert f"{COOKIE}=" in header
    assert "httponly" in header
    assert "samesite=strict" in header
    assert "path=/api/auth" in header
    assert f"max-age={get_settings().refresh_expire_hours * 3600}" in header
    assert "secure" not in header


def test_secure_flag_follows_the_setting(login, monkeypatch):
    monkeypatch.setattr(get_settings(), "cookie_secure", True)

    assert "secure" in set_cookie_header(login())


def test_refresh_token_is_not_in_the_login_body(login):
    assert "refresh_token" not in login().json()


def test_only_the_hash_of_the_token_is_stored(client, session, login):
    login()
    raw = client.cookies.get(COOKIE)

    stored = session.scalars(select(RefreshToken.token_hash)).all()

    assert stored == [hash_refresh_token(raw)]


def test_refresh_returns_a_new_access_token_and_rotates_the_cookie(client, user, login):
    login()
    old = client.cookies.get(COOKIE)

    response = client.post(REFRESH)

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == get_settings().jwt_expire_minutes * 60
    assert decode_access_token(body["access_token"]) == user["id"]
    new = client.cookies.get(COOKIE)
    assert new and new != old


def test_refresh_without_cookie_returns_401(client):
    response = client.post(REFRESH)

    assert response.status_code == 401
    assert response.json()["code"] == "not_authenticated"


def test_refresh_with_unknown_token_returns_401(client):
    use_refresh_token(client, "token-que-nunca-existiu")

    assert client.post(REFRESH).status_code == 401


def test_refresh_with_expired_token_returns_401(client, session, user):
    expired = issue_refresh_token(session, user["id"], lifetime=timedelta(seconds=-1))
    session.commit()
    use_refresh_token(client, expired)

    assert client.post(REFRESH).status_code == 401


def test_reusing_a_rotated_token_returns_401_and_revokes_the_whole_family(client, login):
    login()
    old = client.cookies.get(COOKIE)
    assert client.post(REFRESH).status_code == 200
    newest = client.cookies.get(COOKIE)

    use_refresh_token(client, old)
    assert client.post(REFRESH).status_code == 401

    use_refresh_token(client, newest)
    assert client.post(REFRESH).status_code == 401


def test_reuse_does_not_revoke_other_users(client, login):
    login()
    old = client.cookies.get(COOKIE)
    assert client.post(REFRESH).status_code == 200

    client.cookies.clear()
    client.post(
        "/api/auth/register",
        json={"email": "bia@x.com", "password": "senha-segura-1", "name": "Bia"},
    )
    client.post("/api/auth/login", json={"email": "bia@x.com", "password": "senha-segura-1"})
    bia = client.cookies.get(COOKIE)

    use_refresh_token(client, old)
    assert client.post(REFRESH).status_code == 401

    use_refresh_token(client, bia)
    assert client.post(REFRESH).status_code == 200


def test_logout_revokes_the_session_and_clears_the_cookie(client, login):
    login()
    token = client.cookies.get(COOKIE)

    response = client.post(LOGOUT)

    assert response.status_code == 204
    header = set_cookie_header(response)
    assert f"{COOKIE}=" in header
    assert "max-age=0" in header
    use_refresh_token(client, token)
    assert client.post(REFRESH).status_code == 401


def test_logout_without_cookie_is_a_no_op(client):
    assert client.post(LOGOUT).status_code == 204
