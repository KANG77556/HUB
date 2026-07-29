from uuid import UUID

import pytest

from schoolworkhub.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hash_round_trip() -> None:
    password_hash = hash_password("Correct-Horse-Battery-Staple")

    assert password_hash != "Correct-Horse-Battery-Staple"
    assert verify_password("Correct-Horse-Battery-Staple", password_hash)
    assert not verify_password("incorrect-password", password_hash)


def test_short_password_is_rejected() -> None:
    with pytest.raises(ValueError, match="at least 12"):
        hash_password("too-short")


def test_access_token_round_trip() -> None:
    user_id = UUID("11111111-1111-1111-1111-111111111111")
    school_id = UUID("22222222-2222-2222-2222-222222222222")

    token = create_access_token(user_id, school_id)

    assert decode_access_token(token) == (user_id, school_id)
