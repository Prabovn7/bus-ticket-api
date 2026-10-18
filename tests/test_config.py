from app.core.config import Settings


def test_database_url_is_built_from_parts():
    settings = Settings(
        _env_file=None,
        postgres_user="user",
        postgres_password="p@ss",
        postgres_db="db",
    )
    assert settings.database_url == "postgresql+psycopg://user:p%40ss@localhost:5432/db"
