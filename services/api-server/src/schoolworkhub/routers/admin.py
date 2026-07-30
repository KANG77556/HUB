from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from schoolworkhub.admin_schemas import (
    AuditLogResponse,
    DepartmentCreate,
    DepartmentResponse,
    RoleCreate,
    RoleResponse,
    UserCreate,
    UserResponse,
    UserUpdate,
)
from schoolworkhub.audit import write_audit_log
from schoolworkhub.models import (
    AuditLog,
    Department,
    Permission,
    Role,
    RolePermission,
    User,
    UserRole,
)
from schoolworkhub.permissions import require_permission
from schoolworkhub.routers.auth import SessionDep
from schoolworkhub.security import hash_password

router = APIRouter(prefix="/api/v1/admin", tags=["administration"])
UsersManagerDep = Annotated[User, Depends(require_permission("users.manage"))]
RolesManagerDep = Annotated[User, Depends(require_permission("roles.manage"))]
AuditReaderDep = Annotated[User, Depends(require_permission("audit.read"))]


async def get_user_response(session: AsyncSession, user: User) -> UserResponse:
    role_ids = list(
        await session.scalars(
            select(UserRole.role_id)
            .where(UserRole.user_id == user.id)
            .order_by(UserRole.role_id)
        )
    )
    return UserResponse(
        id=user.id,
        school_id=user.school_id,
        department_id=user.department_id,
        username=user.username,
        display_name=user.display_name,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        role_ids=role_ids,
    )


async def validate_department(
    session: AsyncSession,
    school_id: UUID,
    department_id: UUID | None,
) -> None:
    if department_id is None:
        return
    department = await session.scalar(
        select(Department.id).where(
            Department.id == department_id,
            Department.school_id == school_id,
        )
    )
    if department is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid department")


async def validate_roles(
    session: AsyncSession,
    school_id: UUID,
    role_ids: list[UUID],
) -> None:
    if not role_ids:
        return
    valid_ids = set(
        await session.scalars(
            select(Role.id).where(
                Role.school_id == school_id,
                Role.id.in_(role_ids),
            )
        )
    )
    if valid_ids != set(role_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid role")


@router.get("/departments", response_model=list[DepartmentResponse])
async def list_departments(
    actor: UsersManagerDep,
    session: SessionDep,
) -> list[DepartmentResponse]:
    departments = list(
        await session.scalars(
            select(Department)
            .where(Department.school_id == actor.school_id)
            .order_by(Department.name)
        )
    )
    return [DepartmentResponse.model_validate(item) for item in departments]


@router.post(
    "/departments",
    response_model=DepartmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_department(
    payload: DepartmentCreate,
    actor: UsersManagerDep,
    session: SessionDep,
) -> DepartmentResponse:
    code = payload.code.lower()
    existing = await session.scalar(
        select(Department.id).where(
            Department.school_id == actor.school_id,
            Department.code == code,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="department exists")

    department = Department(
        school_id=actor.school_id,
        code=code,
        name=payload.name.strip(),
    )
    session.add(department)
    await session.flush()
    await write_audit_log(
        session,
        school_id=actor.school_id,
        actor_user_id=actor.id,
        action="department.created",
        target_type="department",
        target_id=str(department.id),
        details={"code": department.code, "name": department.name},
    )
    await session.commit()
    return DepartmentResponse.model_validate(department)


@router.get("/roles", response_model=list[RoleResponse])
async def list_roles(actor: RolesManagerDep, session: SessionDep) -> list[RoleResponse]:
    roles = list(
        await session.scalars(
            select(Role).where(Role.school_id == actor.school_id).order_by(Role.name)
        )
    )
    responses: list[RoleResponse] = []
    for role in roles:
        permission_codes = list(
            await session.scalars(
                select(Permission.code)
                .join(RolePermission, RolePermission.permission_id == Permission.id)
                .where(RolePermission.role_id == role.id)
                .order_by(Permission.code)
            )
        )
        responses.append(
            RoleResponse(
                id=role.id,
                school_id=role.school_id,
                code=role.code,
                name=role.name,
                is_system=role.is_system,
                permission_codes=permission_codes,
            )
        )
    return responses


@router.post("/roles", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: RoleCreate,
    actor: RolesManagerDep,
    session: SessionDep,
) -> RoleResponse:
    code = payload.code.lower()
    existing = await session.scalar(
        select(Role.id).where(Role.school_id == actor.school_id, Role.code == code)
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="role exists")

    requested_codes = set(payload.permission_codes)
    permissions = list(
        await session.scalars(
            select(Permission).where(Permission.code.in_(requested_codes))
        )
    )
    if {permission.code for permission in permissions} != requested_codes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid permission")

    role = Role(
        school_id=actor.school_id,
        code=code,
        name=payload.name.strip(),
        is_system=False,
    )
    session.add(role)
    await session.flush()
    session.add_all(
        RolePermission(role_id=role.id, permission_id=permission.id)
        for permission in permissions
    )
    await write_audit_log(
        session,
        school_id=actor.school_id,
        actor_user_id=actor.id,
        action="role.created",
        target_type="role",
        target_id=str(role.id),
        details={"code": role.code, "permission_codes": sorted(requested_codes)},
    )
    await session.commit()
    return RoleResponse(
        id=role.id,
        school_id=role.school_id,
        code=role.code,
        name=role.name,
        is_system=role.is_system,
        permission_codes=sorted(requested_codes),
    )


@router.get("/users", response_model=list[UserResponse])
async def list_users(actor: UsersManagerDep, session: SessionDep) -> list[UserResponse]:
    users = list(
        await session.scalars(
            select(User).where(User.school_id == actor.school_id).order_by(User.display_name)
        )
    )
    return [await get_user_response(session, user) for user in users]


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    actor: UsersManagerDep,
    session: SessionDep,
) -> UserResponse:
    username = payload.username.lower()
    existing = await session.scalar(
        select(User.id).where(
            User.school_id == actor.school_id,
            User.username == username,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="user exists")

    await validate_department(session, actor.school_id, payload.department_id)
    await validate_roles(session, actor.school_id, payload.role_ids)
    user = User(
        school_id=actor.school_id,
        department_id=payload.department_id,
        username=username,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
        is_active=True,
        is_superuser=False,
    )
    session.add(user)
    await session.flush()
    session.add_all(UserRole(user_id=user.id, role_id=role_id) for role_id in payload.role_ids)
    await write_audit_log(
        session,
        school_id=actor.school_id,
        actor_user_id=actor.id,
        action="user.created",
        target_type="user",
        target_id=str(user.id),
        details={"username": username, "role_ids": [str(value) for value in payload.role_ids]},
    )
    await session.commit()
    return await get_user_response(session, user)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    payload: UserUpdate,
    actor: UsersManagerDep,
    session: SessionDep,
) -> UserResponse:
    user = await session.scalar(
        select(User).where(User.id == user_id, User.school_id == actor.school_id)
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    if user.id == actor.id and payload.is_active is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cannot disable self")

    changes = payload.model_dump(exclude_unset=True)
    if "department_id" in changes:
        await validate_department(session, actor.school_id, payload.department_id)
        user.department_id = payload.department_id
    if payload.display_name is not None:
        user.display_name = payload.display_name.strip()
    if payload.is_active is not None:
        user.is_active = payload.is_active
        if not user.is_active:
            user.failed_login_count = 0
            user.locked_until = None
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
    if payload.role_ids is not None:
        await validate_roles(session, actor.school_id, payload.role_ids)
        await session.execute(delete(UserRole).where(UserRole.user_id == user.id))
        session.add_all(UserRole(user_id=user.id, role_id=role_id) for role_id in payload.role_ids)

    await write_audit_log(
        session,
        school_id=actor.school_id,
        actor_user_id=actor.id,
        action="user.updated",
        target_type="user",
        target_id=str(user.id),
        details={"fields": sorted(changes)},
    )
    await session.commit()
    return await get_user_response(session, user)


@router.get("/audit-logs", response_model=list[AuditLogResponse])
async def list_audit_logs(
    actor: AuditReaderDep,
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[AuditLogResponse]:
    logs = list(
        await session.scalars(
            select(AuditLog)
            .where(AuditLog.school_id == actor.school_id)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
    )
    return [AuditLogResponse.model_validate(log) for log in logs]
