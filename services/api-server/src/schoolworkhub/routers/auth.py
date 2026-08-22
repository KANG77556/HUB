from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from schoolworkhub.audit import write_audit_log
from schoolworkhub.db.session import get_session
from schoolworkhub.models import (
    Department,
    Permission,
    Role,
    RolePermission,
    School,
    User,
    UserRole,
)
from schoolworkhub.refresh_sessions import (
    RefreshSessionRejected,
    issue_refresh_session,
    revoke_refresh_session,
    rotate_refresh_session,
)
from schoolworkhub.schemas import (
    CurrentUserResponse,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    TokenPairResponse,
)
from schoolworkhub.security import (
    InvalidTokenError,
    create_access_token,
    decode_access_token,
    verify_password,
)
from schoolworkhub.settings import get_settings

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])
bearer_scheme = HTTPBearer(auto_error=False)
SessionDep = Annotated[AsyncSession, Depends(get_session)]
CredentialsDep = Annotated[
    HTTPAuthorizationCredentials | None,
    Depends(bearer_scheme),
]


def authentication_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="invalid credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(credentials: CredentialsDep, session: SessionDep) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise authentication_error()

    try:
        user_id, school_id = decode_access_token(credentials.credentials)
    except InvalidTokenError as exc:
        raise authentication_error() from exc

    user = await session.scalar(
        select(User).where(
            User.id == user_id,
            User.school_id == school_id,
            User.is_active.is_(True),
        )
    )
    if user is None:
        raise authentication_error()
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]


@router.post("/login", response_model=TokenPairResponse)
async def login(payload: LoginRequest, session: SessionDep) -> TokenPairResponse:
    settings = get_settings()
    user = await session.scalar(
        select(User)
        .join(School, School.id == User.school_id)
        .where(
            School.code == payload.school_code.lower(),
            User.username == payload.username.lower(),
        )
    )
    if user is None or not user.is_active:
        raise authentication_error()

    now = datetime.now(UTC)
    if user.locked_until is not None and user.locked_until > now:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="account is temporarily locked",
        )

    if not verify_password(payload.password, user.password_hash):
        user.failed_login_count += 1
        if user.failed_login_count >= settings.login_failure_limit:
            user.locked_until = now + timedelta(minutes=settings.login_lock_minutes)
        await write_audit_log(
            session,
            action="auth.login_failed",
            target_type="user",
            target_id=str(user.id),
            school_id=user.school_id,
            actor_user_id=user.id,
            details={"failed_login_count": user.failed_login_count},
        )
        await session.commit()
        raise authentication_error()

    user.failed_login_count = 0
    user.locked_until = None
    await write_audit_log(
        session,
        action="auth.login_succeeded",
        target_type="user",
        target_id=str(user.id),
        school_id=user.school_id,
        actor_user_id=user.id,
    )
    issued = await issue_refresh_session(session, user)
    await session.commit()

    return TokenPairResponse(
        access_token=create_access_token(user.id, user.school_id),
        refresh_token=issued.raw_token,
        expires_in_seconds=settings.access_token_ttl_minutes * 60,
        refresh_expires_in_seconds=settings.refresh_token_ttl_days * 24 * 60 * 60,
    )


@router.post("/refresh", response_model=TokenPairResponse)
async def refresh(payload: RefreshRequest, session: SessionDep) -> TokenPairResponse:
    try:
        user, issued = await rotate_refresh_session(session, payload.refresh_token)
    except RefreshSessionRejected as exc:
        raise authentication_error() from exc

    settings = get_settings()
    response = TokenPairResponse(
        access_token=create_access_token(user.id, user.school_id),
        refresh_token=issued.raw_token,
        expires_in_seconds=settings.access_token_ttl_minutes * 60,
        refresh_expires_in_seconds=settings.refresh_token_ttl_days * 24 * 60 * 60,
    )
    await session.commit()
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutRequest, session: SessionDep) -> None:
    await revoke_refresh_session(session, payload.refresh_token)
    await session.commit()


@router.get("/me", response_model=CurrentUserResponse)
async def read_current_user(user: CurrentUserDep, session: SessionDep) -> CurrentUserResponse:
    school = await session.get(School, user.school_id)
    if school is None:
        raise authentication_error()

    department_names = list(
        await session.scalars(
            select(Department.name).where(
                Department.id == user.department_id,
                Department.school_id == user.school_id,
            )
        )
    )
    roles = list(
        await session.scalars(
            select(Role.code)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user.id)
            .order_by(Role.code)
        )
    )
    permissions = list(
        await session.scalars(
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(UserRole, UserRole.role_id == RolePermission.role_id)
            .where(UserRole.user_id == user.id)
            .distinct()
            .order_by(Permission.code)
        )
    )
    return CurrentUserResponse(
        id=user.id,
        school_id=user.school_id,
        school_name=school.name,
        department_id=user.department_id,
        department_names=department_names,
        username=user.username,
        display_name=user.display_name,
        is_superuser=user.is_superuser,
        roles=roles,
        permissions=permissions,
    )
