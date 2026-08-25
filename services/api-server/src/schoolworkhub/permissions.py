from collections.abc import Awaitable, Callable

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from schoolworkhub.models import Permission, RolePermission, User, UserRole
from schoolworkhub.routers.auth import CurrentUserDep, SessionDep


async def user_has_permission(
    session: AsyncSession,
    user: User,
    permission_code: str,
) -> bool:
    if user.is_superuser:
        return True
    permission = await session.scalar(
        select(Permission.id)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(UserRole, UserRole.role_id == RolePermission.role_id)
        .where(
            UserRole.user_id == user.id,
            Permission.code == permission_code,
        )
        .limit(1)
    )
    return permission is not None


def require_permission(permission_code: str) -> Callable[..., Awaitable[User]]:
    async def dependency(user: CurrentUserDep, session: SessionDep) -> User:
        if not await user_has_permission(session, user, permission_code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="insufficient permission",
            )
        return user

    return dependency
