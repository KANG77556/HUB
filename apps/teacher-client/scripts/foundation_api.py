from __future__ import annotations

import argparse
import secrets
import threading
import time
from dataclasses import dataclass, field
from typing import Annotated

import uvicorn
from fastapi import FastAPI, Header, HTTPException, Response, status
from pydantic import BaseModel

SCHOOL_CODE = "foundation-school"
SCHOOL_ID = "11111111-1111-4111-8111-111111111111"
USER_ID = "22222222-2222-4222-8222-222222222222"
USERNAME = "foundation.teacher"
PASSWORD = "Foundation-Only-Password"


class LoginRequest(BaseModel):
    school_code: str
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


@dataclass
class FixtureState:
    access_tokens: set[str] = field(default_factory=set)
    refresh_tokens: set[str] = field(default_factory=set)
    refresh_count: int = 0
    dashboard_version: int = 1

    def reset(self) -> None:
        self.access_tokens.clear()
        self.refresh_tokens.clear()
        self.refresh_count = 0
        self.dashboard_version = 1

    def issue_pair(self) -> dict[str, str | int]:
        access_token = f"access-{secrets.token_urlsafe(32)}"
        refresh_token = f"refresh-{secrets.token_urlsafe(48)}"
        self.access_tokens.add(access_token)
        self.refresh_tokens.add(refresh_token)
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in_seconds": 900,
            "refresh_expires_in_seconds": 2_592_000,
        }


fixture = FixtureState()
app = FastAPI(title="SchoolWorkHub foundation fixture", docs_url=None, redoc_url=None)


def require_access(authorization: str | None) -> None:
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    token = authorization.removeprefix("Bearer ")
    if token not in fixture.access_tokens:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


def current_user() -> dict[str, object]:
    return {
        "id": USER_ID,
        "school_id": SCHOOL_ID,
        "school_name": "Foundation School",
        "department_id": None,
        "department_names": ["Academic Affairs"],
        "username": USERNAME,
        "display_name": "Foundation Teacher",
        "is_superuser": False,
        "roles": ["teacher", "teacher_lead"],
        "permissions": [
            "dashboard.read",
            "calendar.read",
            "documents.read",
            "submissions.read",
        ],
    }


def dashboard_payload() -> dict[str, object]:
    base_schedule = {
        "id": "schedule-1",
        "title": "교무회의" if fixture.dashboard_version == 1 else "교무회의 변경",
        "status": "scheduled" if fixture.dashboard_version == 1 else "updated",
        "updated_at": (
            "2026-07-31T00:10:00.000Z"
            if fixture.dashboard_version == 1
            else "2026-07-31T01:10:00.000Z"
        ),
    }
    schedules: list[dict[str, str]] = [base_schedule]
    documents: list[dict[str, str]] = [
        {
            "id": "document-1",
            "title": "가정통신문",
            "status": "published",
            "updated_at": "2026-07-31T00:20:00.000Z",
        }
    ]
    if fixture.dashboard_version >= 2:
        schedules.append(
            {
                "id": "schedule-2",
                "title": "학년 협의회",
                "status": "scheduled",
                "updated_at": "2026-07-31T01:20:00.000Z",
            }
        )
        documents.append(
            {
                "id": "document-2",
                "title": "새 업무 안내",
                "status": "published",
                "updated_at": "2026-07-31T01:30:00.000Z",
            }
        )
    return {
        "generated_at": (
            "2026-07-31T00:00:00.000Z"
            if fixture.dashboard_version == 1
            else "2026-07-31T01:00:00.000Z"
        ),
        "roles": ["teacher", "teacher_lead"],
        "permissions": [
            "dashboard.read",
            "calendar.read",
            "documents.read",
            "submissions.read",
        ],
        "metrics": [
            {
                "key": "submissions.pending",
                "count": 2 if fixture.dashboard_version == 1 else 3,
            },
            {"key": "documents.recent", "count": len(documents)},
        ],
        "schedule_items": schedules,
        "document_items": documents,
    }


@app.get("/api/v1/system/identity")
def identity() -> dict[str, str]:
    return {
        "service": "schoolworkhub",
        "api_version": "v1",
        "school_code": SCHOOL_CODE,
        "school_name": "Foundation School",
    }


@app.post("/api/v1/auth/login")
def login(request: LoginRequest) -> dict[str, str | int]:
    if (
        request.school_code != SCHOOL_CODE
        or request.username != USERNAME
        or request.password != PASSWORD
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return fixture.issue_pair()


@app.post("/api/v1/auth/refresh")
def refresh(request: RefreshRequest) -> dict[str, str | int]:
    if request.refresh_token not in fixture.refresh_tokens:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    fixture.refresh_tokens.remove(request.refresh_token)
    fixture.refresh_count += 1
    return fixture.issue_pair()


@app.post("/api/v1/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: RefreshRequest) -> Response:
    fixture.refresh_tokens.discard(request.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/v1/auth/me")
def me(
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    require_access(authorization)
    return current_user()


@app.get("/api/v1/dashboard")
def dashboard(
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    require_access(authorization)
    return dashboard_payload()


@app.post("/__test__/reset")
def reset() -> dict[str, bool]:
    fixture.reset()
    return {"ok": True}


@app.post("/__test__/dashboard-version/{version}")
def set_dashboard_version(version: int) -> dict[str, int]:
    if version not in {1, 2}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST)
    fixture.dashboard_version = version
    return {"dashboard_version": version}


@app.get("/__test__/metrics")
def metrics() -> dict[str, int]:
    return {"refresh_count": fixture.refresh_count}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=args.port,
        log_level="error",
        access_log=False,
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, name="foundation-api", daemon=False)
    thread.start()
    deadline = time.monotonic() + 15
    while not server.started and thread.is_alive() and time.monotonic() < deadline:
        time.sleep(0.01)
    if not server.started:
        raise RuntimeError("FOUNDATION_API_START_FAILED")
    print(f"FOUNDATION_API_READY {args.port}", flush=True)
    thread.join()


if __name__ == "__main__":
    main()
