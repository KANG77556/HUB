from datetime import UTC, datetime

from fastapi import APIRouter
from sqlalchemy import select

from schoolworkhub.models import Permission, Role, RolePermission, UserRole
from schoolworkhub.routers.auth import CurrentUserDep, SessionDep
from schoolworkhub.schemas import DashboardMetric, DashboardSnapshotResponse

router = APIRouter(prefix="/api/v1", tags=["dashboard"])

METRIC_PERMISSIONS = {
    "schedule.today": "calendar.read",
    "documents.new": "documents.read",
    "submissions.pending": "submissions.read",
}


@router.get("/dashboard", response_model=DashboardSnapshotResponse)
async def read_dashboard(
    user: CurrentUserDep,
    session: SessionDep,
) -> DashboardSnapshotResponse:
    roles = list(
        await session.scalars(
            select(Role.code)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user.id)
            .distinct()
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
    permission_set = set(permissions)
    metrics = [
        DashboardMetric(key=key, count=0)
        for key, permission in sorted(METRIC_PERMISSIONS.items())
        if permission in permission_set
    ]
    return DashboardSnapshotResponse(
        generated_at=datetime.now(UTC),
        roles=roles,
        permissions=permissions,
        metrics=metrics,
        schedule_items=[],
        document_items=[],
    )
