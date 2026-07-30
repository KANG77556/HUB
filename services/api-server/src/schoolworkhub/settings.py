from functools import lru_cache

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SWH_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = "development"
    database_url: str = (
        "postgresql+asyncpg://schoolworkhub:schoolworkhub-dev@127.0.0.1:5432/"
        "schoolworkhub"
    )
    secret_key: SecretStr = SecretStr("development-only-change-this-secret-key")
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    login_failure_limit: int = 5
    login_lock_minutes: int = 15

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) < 32:
            raise ValueError("SWH_SECRET_KEY must contain at least 32 characters")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
