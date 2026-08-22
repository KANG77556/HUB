from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from schoolworkhub.models import AuditLog


async def write_audit_log(
    session: AsyncSession,
    *,
    action: str,
    target_type: str,
    school_id: UUID | None = None,
    actor_user_id: UUID | None = None,
    target_id: str | None = None,
    details: dict[str, object] | None = None,
) -> None:
    session.add(
        AuditLog(
            school_id=school_id,
            actor_user_id=actor_user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details or {},
        )
    )
