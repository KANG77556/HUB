from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from schoolworkhub.db.session import SessionFactory
from schoolworkhub.main import create_app
from schoolworkhub.models import RefreshSession, School, User
from schoolworkhub.security import hash_password, hash_refresh_token


def test_bootstrap_login_and_administration_flow() -> None:
    payload = {
        "school_code": "sample-school",
        "school_name": "샘플학교",
        "admin_username": "admin",
        "admin_display_name": "최고관리자",
        "admin_password": "Correct-Horse-Battery-Staple",
    }

    with TestClient(create_app()) as client:
        bootstrap_response = client.post("/api/v1/setup/bootstrap", json=payload)
        assert bootstrap_response.status_code == 201
        assert bootstrap_response.json()["status"] == "created"

        duplicate_response = client.post("/api/v1/setup/bootstrap", json=payload)
        assert duplicate_response.status_code == 409

        invalid_login_response = client.post(
            "/api/v1/auth/login",
            json={
                "school_code": "sample-school",
                "username": "admin",
                "password": "wrong-password",
            },
        )
        assert invalid_login_response.status_code == 401

        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "school_code": "sample-school",
                "username": "admin",
                "password": "Correct-Horse-Battery-Staple",
            },
        )
        assert login_response.status_code == 200
        body = login_response.json()
        assert body["token_type"] == "bearer"
        assert body["expires_in_seconds"] == 900
        assert body["refresh_expires_in_seconds"] == 2_592_000
        assert body["access_token"]
        assert body["refresh_token"]

        first_access_token = body["access_token"]
        first_refresh_token = body["refresh_token"]
        headers = {"Authorization": f"Bearer {first_access_token}"}

        me_response = client.get("/api/v1/auth/me", headers=headers)
        assert me_response.status_code == 200
        current_user = me_response.json()
        assert current_user["username"] == "admin"
        assert current_user["school_name"] == "샘플학교"
        assert current_user["department_names"] == []
        assert current_user["roles"] == ["administrator"]
        assert "system.admin" in current_user["permissions"]

        refresh_response = client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": first_refresh_token},
        )
        assert refresh_response.status_code == 200
        refreshed = refresh_response.json()
        assert refreshed["refresh_token"] != first_refresh_token
        assert refreshed["access_token"] != first_access_token

        reused_response = client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": first_refresh_token},
        )
        assert reused_response.status_code == 401

        logout_response = client.post(
            "/api/v1/auth/logout",
            json={"refresh_token": refreshed["refresh_token"]},
        )
        assert logout_response.status_code == 204
        assert logout_response.content == b""

        logged_out_refresh = client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refreshed["refresh_token"]},
        )
        assert logged_out_refresh.status_code == 401

        headers = {"Authorization": f"Bearer {refreshed['access_token']}"}
        department_response = client.post(
            "/api/v1/admin/departments",
            headers=headers,
            json={"code": "career", "name": "취업지원부"},
        )
        assert department_response.status_code == 201
        department_id = department_response.json()["id"]

        role_response = client.post(
            "/api/v1/admin/roles",
            headers=headers,
            json={
                "code": "career_manager",
                "name": "취업관리자",
                "permission_codes": ["employment.manage"],
            },
        )
        assert role_response.status_code == 201
        role_id = role_response.json()["id"]

        user_response = client.post(
            "/api/v1/admin/users",
            headers=headers,
            json={
                "username": "career.teacher",
                "display_name": "취업 담당교사",
                "password": "Another-Correct-Password",
                "department_id": department_id,
                "role_ids": [role_id],
            },
        )
        assert user_response.status_code == 201
        created_user = user_response.json()
        assert created_user["department_id"] == department_id
        assert created_user["role_ids"] == [role_id]

        update_response = client.patch(
            f"/api/v1/admin/users/{created_user['id']}",
            headers=headers,
            json={"display_name": "취업지원 담당교사", "is_active": True},
        )
        assert update_response.status_code == 200
        assert update_response.json()["display_name"] == "취업지원 담당교사"

        users_response = client.get("/api/v1/admin/users", headers=headers)
        assert users_response.status_code == 200
        assert {item["username"] for item in users_response.json()} == {
            "admin",
            "career.teacher",
        }

        audit_response = client.get("/api/v1/admin/audit-logs", headers=headers)
        assert audit_response.status_code == 200
        actions = {item["action"] for item in audit_response.json()}
        assert "department.created" in actions
        assert "role.created" in actions
        assert "user.created" in actions
        assert "user.updated" in actions


async def test_refresh_rejects_expired_and_inactive_sessions() -> None:
    school_code = f"auth-{uuid4().hex[:12]}"
    username = f"teacher-{uuid4().hex[:10]}"
    password = "Correct-Horse-Battery-Staple"

    async with SessionFactory() as session:
        school = School(code=school_code, name="Authentication School")
        session.add(school)
        await session.flush()
        user = User(
            school_id=school.id,
            department_id=None,
            username=username,
            display_name="Authentication Teacher",
            password_hash=hash_password(password),
            is_active=True,
            is_superuser=False,
        )
        session.add(user)
        await session.commit()
        user_id = user.id

    transport = ASGITransport(app=create_app())
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        login_response = await client.post(
            "/api/v1/auth/login",
            json={"school_code": school_code, "username": username, "password": password},
        )
        assert login_response.status_code == 200
        expired_token = login_response.json()["refresh_token"]

        async with SessionFactory() as session:
            stored = await session.scalar(
                select(RefreshSession).where(
                    RefreshSession.token_hash == hash_refresh_token(expired_token)
                )
            )
            assert stored is not None
            stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            await session.commit()

        expired_response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": expired_token},
        )
        assert expired_response.status_code == 401

        second_login = await client.post(
            "/api/v1/auth/login",
            json={"school_code": school_code, "username": username, "password": password},
        )
        assert second_login.status_code == 200
        inactive_token = second_login.json()["refresh_token"]

        async with SessionFactory() as session:
            stored_user = await session.get(User, user_id)
            assert stored_user is not None
            stored_user.is_active = False
            await session.commit()

        inactive_response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": inactive_token},
        )
        assert inactive_response.status_code == 401
