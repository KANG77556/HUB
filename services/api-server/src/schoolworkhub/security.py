from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
import jwt

from schoolworkhub.settings import get_settings


password_hasher = PasswordHasher()


class InvalidTokenError(ValueError):
    pass


def hash_password(password: str) -> str:
    if len(password) < 12:
        raise ValueError("password must contain at least 12 characters")
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def create_access_token(user_id: UUID, school_id: UUID) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=settings.access_token_ttl_minutes)
    payload = {
        "sub": str(user_id),
        "school_id": str(school_id),
        "iss": "schoolworkhub",
        "iat": now,
        "exp": expires_at,
    }
    return jwt.encode(
        payload,
        settings.secret_key.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> tuple[UUID, UUID]:
    settings = get_settings()
    try:
        raw_payload = jwt.decode(
            token,
            settings.secret_key.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
            issuer="schoolworkhub",
        )
        payload = cast(dict[str, object], raw_payload)
        return UUID(str(payload["sub"])), UUID(str(payload["school_id"]))
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
        raise InvalidTokenError("invalid access token") from exc
