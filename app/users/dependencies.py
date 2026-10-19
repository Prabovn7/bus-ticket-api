from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.errors import NotAuthenticated
from app.core.security import decode_access_token
from app.users.models import User
from app.users.service import get_user

# auto_error=False: without it FastAPI answers on its own, outside our {"code","message"} format.
bearer_scheme = HTTPBearer(auto_error=False)

SessionDep = Annotated[Session, Depends(get_session)]


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: SessionDep,
) -> User:
    if credentials is None:
        raise NotAuthenticated()
    user = get_user(session, decode_access_token(credentials.credentials))
    if user is None:
        raise NotAuthenticated()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
