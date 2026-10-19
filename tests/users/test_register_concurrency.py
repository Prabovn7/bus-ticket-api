from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import EmailAlreadyRegistered
from app.users.models import User
from app.users.service import register_user

ATTEMPTS = 8


def test_concurrent_registrations_of_the_same_email_create_one_user(db_engine, session):
    def attempt(_: int) -> bool:
        with Session(db_engine) as own_session:
            try:
                register_user(own_session, "ana@x.com", "senha-segura-1", "Ana")
            except EmailAlreadyRegistered:
                return False
            return True

    with ThreadPoolExecutor(max_workers=ATTEMPTS) as pool:
        results = list(pool.map(attempt, range(ATTEMPTS)))

    assert results.count(True) == 1
    assert session.scalar(select(func.count()).select_from(User)) == 1
