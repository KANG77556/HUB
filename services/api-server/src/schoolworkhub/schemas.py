from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BootstrapRequest(BaseModel):
    school_code: str = Field(min_length=2, max_length=30, pattern=r"^[A-Za-z0-9_-]+$")
    school_name: str = Field(min_length=2, max_length=200)
    admin_username: str = Field(min_length=3, max_length=80, pattern=r"^[A-Za-z0-9._-]+$")
    admin_display_name: str = Field(min_length=2, max_length=100)
    admin_password: str = Field(min_length=12, max_length=256)


class BootstrapResponse(BaseModel):
    school_id: UUID
    admin_user_id: UUID
    status: str


class LoginRequest(BaseModel):
    school_code: str = Field(min_length=2, max_length=30)
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=1, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int


class CurrentUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    school_id: UUID
    department_id: UUID | None
    username: str
    display_name: str
    is_superuser: bool
    roles: list[str]
    permissions: list[str]
