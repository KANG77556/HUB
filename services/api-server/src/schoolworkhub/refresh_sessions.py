from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from schoolworkhub.models import RefreshSession, User
from schoolworkhub.security import generate_refresh_token, hash_refresh_token
from schoolworkhub.settings import get_settings


@dataclass(frozen=True)
class IssuedRefreshSession:
    raw_token: str
    expires_at: datetime


class RefreshSessionRejected(ValueError):
    pass


async def issue_refresh_session(
    session: AsyncSession,
    user: User,
) -> IssuedRefreshSession:
    settings = get_settings()
    raw_token = generate_refresh_token()
    expires_at = datetime.now(UTC) + timedelta(days=settings.refresh_token_ttl_days)
    session.add(
        RefreshSession(
            user_id=user.id,
            school_id=user.school_id,
            token_hash=hash_refresh_token(raw_token),
            expires_at=expires_at,
            last_used_at=None,
            revoked_at=None,
        )
    )
    await session.flush()
    return IssuedRefreshSession(raw_token=raw_token, expires_at=expires_at)


async def rotate_refresh_session(
    session: AsyncSession,
    raw_token: str,
) -> tuple[User, IssuedRefreshSession]:
    now = datetime.now(UTC)
    refresh_session = await session.scalar(
        select(RefreshSession)
        .where(
            RefreshSession.token_hash == hash_refresh_token(raw_token),
            RefreshSession.revoked_at.is_(None),
        )
        .with_for_update()
    )
    if refresh_session is None or refresh_session.expires_at <= now:
        raise RefreshSessionRejected("refresh session rejected")

    user = await session.scalar(
        select(User)
        .where(
            User.id == refresh_session.user_id,
            User.school_id == refresh_session.school_id,
            User.is_active.is_(True),
        )
        .with_for_update()
    )
    if user is None:
        raise RefreshSessionRejected("refresh session rejected")

    refresh_session.last_used_at = now
    refresh_session.revoked_at = now
    replacement = await issue_refresh_session(session, user)
    return user, replacement


async def revoke_refresh_session(session: AsyncSession, raw_token: str) -> bool:
    refresh_session = await session.scalar(
        select(RefreshSession)
        .where(
            RefreshSession.token_hash == hash_refresh_token(raw_token),
            RefreshSession.revoked_at.is_(None),
        )
        .with_for_update()
    )
    if refresh_session is None:
        return False

    now = datetime.now(UTC)
    refresh_session.last_used_at = now
    refresh_session.revoked_at = now
    await session.flush()
    return True
