from fastapi import APIRouter, status

from app.core.config import get_settings
from app.core.security import create_access_token
from app.users.dependencies import CurrentUser, SessionDep
from app.users.models import User
from app.users.schemas import LoginIn, RegisterIn, TokenOut, UserOut
from app.users.service import authenticate, register_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, session: SessionDep) -> User:
    return register_user(session, data.email, data.password, data.name)


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, session: SessionDep) -> TokenOut:
    user = authenticate(session, data.email, data.password)
    return TokenOut(
        access_token=create_access_token(user.id),
        expires_in=get_settings().jwt_expire_minutes * 60,
    )


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user
