from typing import Annotated

from fastapi import APIRouter, Cookie, Response, status

from app.core.config import get_settings
from app.core.errors import NotAuthenticated
from app.core.security import create_access_token
from app.users.dependencies import CurrentUser, SessionDep
from app.users.models import User
from app.users.schemas import LoginIn, RegisterIn, TokenOut, UserOut
from app.users.service import (
    authenticate,
    issue_refresh_token,
    register_user,
    revoke_refresh_session,
    rotate_refresh_token,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
COOKIE_PATH = "/api/auth"

RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE)]


def _set_refresh_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.refresh_expire_hours * 3600,
        path=COOKIE_PATH,
        httponly=True,
        samesite="strict",
        secure=settings.cookie_secure,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        REFRESH_COOKIE,
        path=COOKIE_PATH,
        httponly=True,
        samesite="strict",
        secure=get_settings().cookie_secure,
    )


def _token_out(user_id: int) -> TokenOut:
    return TokenOut(
        access_token=create_access_token(user_id),
        expires_in=get_settings().jwt_expire_minutes * 60,
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, session: SessionDep) -> User:
    return register_user(session, data.email, data.password, data.name)


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, response: Response, session: SessionDep) -> TokenOut:
    user = authenticate(session, data.email, data.password)
    user_id = user.id
    refresh_token = issue_refresh_token(session, user_id)
    session.commit()
    _set_refresh_cookie(response, refresh_token)
    return _token_out(user_id)


@router.post("/refresh", response_model=TokenOut)
def refresh(
    response: Response, session: SessionDep, refresh_token: RefreshCookie = None
) -> TokenOut:
    if refresh_token is None:
        raise NotAuthenticated()
    user, new_token = rotate_refresh_token(session, refresh_token)
    _set_refresh_cookie(response, new_token)
    return _token_out(user.id)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, session: SessionDep, refresh_token: RefreshCookie = None) -> None:
    revoke_refresh_session(session, refresh_token)
    _clear_refresh_cookie(response)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user
