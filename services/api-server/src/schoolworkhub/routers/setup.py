from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from schoolworkhub.audit import write_audit_log
from schoolworkhub.db.session import get_session
from schoolworkhub.models import Permission, Role, RolePermission, School, User, UserRole
from schoolworkhub.schemas import BootstrapRequest, BootstrapResponse
from schoolworkhub.security import hash_password

router = APIRouter(prefix="/api/v1/setup", tags=["setup"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]

DEFAULT_PERMISSIONS = {
    "system.admin": "시스템 전체 관리",
    "users.manage": "사용자 관리",
    "roles.manage": "역할과 권한 관리",
    "audit.read": "감사로그 조회",
    "documents.manage": "문서 관리",
    "submissions.manage": "자료 제출 관리",
    "timetable.manage": "시간표 관리",
    "tasks.manage": "공유 업무 관리",
    "calendar.manage": "일정과 회의 관리",
    "night_study.manage": "야간자율학습 관리",
    "employment.manage": "취업관리",
    "operations.manage": "서버 운영 관리",
}


@router.post(
    "/bootstrap",
    response_model=BootstrapResponse,
    status_code=status.HTTP_201_CREATED,
)
async def bootstrap_system(payload: BootstrapRequest, session: SessionDep) -> BootstrapResponse:
    await session.execute(text("SELECT pg_advisory_xact_lock(834701221)"))
    existing_users = await session.scalar(select(func.count(User.id)))
    if existing_users:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="initial setup has already been completed",
        )

    school = School(code=payload.school_code.lower(), name=payload.school_name.strip())
    session.add(school)
    await session.flush()

    permissions = [
        Permission(code=code, name=name) for code, name in DEFAULT_PERMISSIONS.items()
    ]
    session.add_all(permissions)

    administrator_role = Role(
        school_id=school.id,
        code="administrator",
        name="최고관리자",
        is_system=True,
    )
    administrator = User(
        school_id=school.id,
        username=payload.admin_username.lower(),
        display_name=payload.admin_display_name.strip(),
        password_hash=hash_password(payload.admin_password),
        is_active=True,
        is_superuser=True,
    )
    session.add_all([administrator_role, administrator])
    await session.flush()

    session.add(UserRole(user_id=administrator.id, role_id=administrator_role.id))
    session.add_all(
        RolePermission(role_id=administrator_role.id, permission_id=permission.id)
        for permission in permissions
    )
    await write_audit_log(
        session,
        action="system.bootstrap",
        target_type="school",
        target_id=str(school.id),
        school_id=school.id,
        actor_user_id=administrator.id,
        details={"school_code": school.code, "admin_username": administrator.username},
    )
    await session.commit()

    return BootstrapResponse(
        school_id=school.id,
        admin_user_id=administrator.id,
        status="created",
    )
