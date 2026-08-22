from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError

from schoolworkhub.db.session import dispose_engine, ping_database
from schoolworkhub.routers import admin, auth, dashboard, knowledge, setup, system


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    app = FastAPI(
        title="SchoolWorkHub API",
        version="0.3.0",
        docs_url=None,
        redoc_url=None,
        lifespan=lifespan,
    )
    app.include_router(setup.router)
    app.include_router(auth.router)
    app.include_router(admin.router)
    app.include_router(system.router)
    app.include_router(dashboard.router)
    app.include_router(knowledge.router)

    @app.get("/health/live", response_model=HealthResponse, tags=["health"])
    async def health_live() -> HealthResponse:
        return HealthResponse(status="ok", service="api", version=app.version)

    @app.get("/health/ready", response_model=HealthResponse, tags=["health"])
    async def health_ready() -> HealthResponse:
        try:
            await ping_database()
        except SQLAlchemyError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="database is not ready",
            ) from exc
        return HealthResponse(status="ready", service="api", version=app.version)

    return app


app = create_app()
