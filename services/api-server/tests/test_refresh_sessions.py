from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import select

from schoolworkhub.db.session import SessionFactory
from schoolworkhub.models import RefreshSession, School, User
from schoolworkhub.refresh_sessions import (
    RefreshSessionRejected,
    issue_refresh_session,
    revoke_refresh_session,
    rotate_refresh_session,
)
from schoolworkhub.security import (
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
)


def test_refresh_token_is_random_and_hash_is_stable() -> None:
    first = generate_refresh_token()
    second = generate_refresh_token()

    assert first != second
    assert len(first) >= 43
    assert hash_refresh_token(first) == hash_refresh_token(first)
    assert hash_refresh_token(first) != hash_refresh_token(second)


async def test_refresh_session_rotation_rejects_reuse_and_supports_revocation() -> None:
    school_code = f"refresh-{uuid4().hex[:12]}"

    async with SessionFactory() as session:
        school = School(code=school_code, name="Refresh Session School")
        session.add(school)
        await session.flush()

        user = User(
            school_id=school.id,
            department_id=None,
            username=f"teacher-{uuid4().hex[:10]}",
            display_name="Refresh Teacher",
            password_hash=hash_password("Correct-Horse-Battery-Staple"),
            is_active=True,
            is_superuser=False,
        )
        session.add(user)
        await session.flush()

        issued = await issue_refresh_session(session, user)
        await session.commit()

        assert issued.raw_token
        assert issued.expires_at > datetime.now(UTC)

        stored = await session.scalar(
            select(RefreshSession).where(
                RefreshSession.token_hash == hash_refresh_token(issued.raw_token)
            )
        )
        assert stored is not None
        assert stored.token_hash != issued.raw_token

        rotated_user, rotated = await rotate_refresh_session(session, issued.raw_token)
        await session.commit()

        assert rotated_user.id == user.id
        assert rotated.raw_token != issued.raw_token

        with pytest.raises(RefreshSessionRejected):
            await rotate_refresh_session(session, issued.raw_token)

        assert await revoke_refresh_session(session, rotated.raw_token) is True
        await session.commit()
        assert await revoke_refresh_session(session, rotated.raw_token) is False
