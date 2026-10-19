from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.users.models import User
from app.users.schemas import RegisterIn, UserOut
from app.users.service import register_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, session: SessionDep) -> User:
    return register_user(session, data.email, data.password, data.name)
