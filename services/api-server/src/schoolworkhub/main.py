from fastapi import FastAPI
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


def create_app() -> FastAPI:
    app = FastAPI(
        title="SchoolWorkHub API",
        version="0.1.0",
        docs_url=None,
        redoc_url=None,
    )

    @app.get("/health/live", response_model=HealthResponse, tags=["health"])
    async def health_live() -> HealthResponse:
        return HealthResponse(status="ok", service="api", version=app.version)

    @app.get("/health/ready", response_model=HealthResponse, tags=["health"])
    async def health_ready() -> HealthResponse:
        return HealthResponse(status="ready", service="api", version=app.version)

    return app


app = create_app()
