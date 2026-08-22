from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from schoolworkhub.settings import get_settings

settings = get_settings()
if settings.environment == "test":
    engine: AsyncEngine = create_async_engine(
        settings.database_url,
        poolclass=NullPool,
    )
else:
    engine = create_async_engine(
        settings.database_url,
        pool_pre_ping=True,
    )
SessionFactory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionFactory() as session:
        yield session


async def ping_database() -> None:
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))


async def dispose_engine() -> None:
    await engine.dispose()
