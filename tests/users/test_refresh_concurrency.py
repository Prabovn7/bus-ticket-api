from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy.orm import Session

from app.core.errors import NotAuthenticated
from app.users.service import issue_refresh_token, register_user, rotate_refresh_token

ATTEMPTS = 8


def test_concurrent_refreshes_of_the_same_token_rotate_it_only_once(db_engine, session):
    user = register_user(session, "ana@x.com", "senha-segura-1", "Ana")
    user_id = user.id
    token = issue_refresh_token(session, user_id)
    session.commit()

    def attempt(_: int) -> str | None:
        with Session(db_engine) as own_session:
            try:
                _, new_token = rotate_refresh_token(own_session, token)
            except NotAuthenticated:
                return None
            return new_token

    with ThreadPoolExecutor(max_workers=ATTEMPTS) as pool:
        results = list(pool.map(attempt, range(ATTEMPTS)))

    winners = [result for result in results if result is not None]
    assert len(winners) == 1

    # the losers presented a used token, so the family was revoked: the winner's new token is dead
    with Session(db_engine) as own_session, pytest.raises(NotAuthenticated):
        rotate_refresh_token(own_session, winners[0])
