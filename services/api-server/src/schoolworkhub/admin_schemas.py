from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DepartmentCreate(BaseModel):
    code: str = Field(min_length=1, max_length=30, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=100)


class DepartmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    school_id: UUID
    code: str
    name: str


class RoleCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    name: str = Field(min_length=1, max_length=100)
    permission_codes: list[str] = Field(default_factory=list, max_length=100)


class RoleResponse(BaseModel):
    id: UUID
    school_id: UUID
    code: str
    name: str
    is_system: bool
    permission_codes: list[str]


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80, pattern=r"^[A-Za-z0-9._-]+$")
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=12, max_length=256)
    department_id: UUID | None = None
    role_ids: list[UUID] = Field(default_factory=list, max_length=30)


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    department_id: UUID | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=12, max_length=256)
    role_ids: list[UUID] | None = Field(default=None, max_length=30)


class UserResponse(BaseModel):
    id: UUID
    school_id: UUID
    department_id: UUID | None
    username: str
    display_name: str
    is_active: bool
    is_superuser: bool
    role_ids: list[UUID]


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    school_id: UUID | None
    actor_user_id: UUID | None
    action: str
    target_type: str
    target_id: str | None
    details: dict[str, object]
    created_at: datetime
