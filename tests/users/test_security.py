from app.core.security import hash_password, verify_password


def test_hash_is_not_the_password_and_verifies():
    hashed = hash_password("senha-segura-1")

    assert hashed != "senha-segura-1"
    assert hashed.startswith("$argon2")
    assert verify_password("senha-segura-1", hashed) is True


def test_wrong_password_does_not_verify():
    hashed = hash_password("senha-segura-1")

    assert verify_password("outra-senha", hashed) is False


def test_same_password_gives_different_hashes():
    # each hash carries its own random salt
    assert hash_password("senha-segura-1") != hash_password("senha-segura-1")
