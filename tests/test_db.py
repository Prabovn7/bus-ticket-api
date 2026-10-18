from sqlalchemy import text


def test_session_executes_query(session):
    assert session.execute(text("select 1")).scalar() == 1
