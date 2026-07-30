from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from schoolworkhub.db.session import engine
from schoolworkhub.main import create_app


async def reset_database() -> None:
    await engine.dispose()
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "TRUNCATE TABLE audit_logs, refresh_sessions, role_permissions, "
                "user_roles, users, roles, permissions, departments, schools "
                "RESTART IDENTITY CASCADE"
            )
        )
    await engine.dispose()


async def test_server_identity_and_permission_union_dashboard() -> None:
    await reset_database()
    try:
        transport = ASGITransport(app=create_app())
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            initial_identity = await client.get("/api/v1/system/identity")
            assert initial_identity.status_code == 200
            assert initial_identity.json() == {
                "service": "schoolworkhub",
                "api_version": "v1",
                "school_code": None,
                "school_name": None,
            }

            bootstrap_response = await client.post(
                "/api/v1/setup/bootstrap",
                json={
                    "school_code": "sample-school",
                    "school_name": "샘플학교",
                    "admin_username": "admin",
                    "admin_display_name": "최고관리자",
                    "admin_password": "Correct-Horse-Battery-Staple",
                },
            )
            assert bootstrap_response.status_code == 201
            admin_user_id = bootstrap_response.json()["admin_user_id"]

            identity = await client.get("/api/v1/system/identity")
            assert identity.status_code == 200
            assert identity.json() == {
                "service": "schoolworkhub",
                "api_version": "v1",
                "school_code": "sample-school",
                "school_name": "샘플학교",
            }

            anonymous_dashboard = await client.get("/api/v1/dashboard")
            assert anonymous_dashboard.status_code == 401

            login_response = await client.post(
                "/api/v1/auth/login",
                json={
                    "school_code": "sample-school",
                    "username": "admin",
                    "password": "Correct-Horse-Battery-Staple",
                },
            )
            assert login_response.status_code == 200
            headers = {
                "Authorization": f"Bearer {login_response.json()['access_token']}"
            }

            roles_response = await client.get("/api/v1/admin/roles", headers=headers)
            assert roles_response.status_code == 200
            administrator_role_id = next(
                role["id"]
                for role in roles_response.json()
                if role["code"] == "administrator"
            )

            extra_role_response = await client.post(
                "/api/v1/admin/roles",
                headers=headers,
                json={
                    "code": "teacher_lead",
                    "name": "교무부장",
                    "permission_codes": ["calendar.read", "documents.read"],
                },
            )
            assert extra_role_response.status_code == 201
            extra_role_id = extra_role_response.json()["id"]

            update_response = await client.patch(
                f"/api/v1/admin/users/{admin_user_id}",
                headers=headers,
                json={"role_ids": [administrator_role_id, extra_role_id]},
            )
            assert update_response.status_code == 200

            dashboard_response = await client.get("/api/v1/dashboard", headers=headers)
            assert dashboard_response.status_code == 200
            dashboard = dashboard_response.json()
            assert dashboard["roles"] == ["administrator", "teacher_lead"]
            assert dashboard["permissions"] == sorted(set(dashboard["permissions"]))
            assert "calendar.read" in dashboard["permissions"]
            assert "documents.read" in dashboard["permissions"]
            assert "submissions.read" in dashboard["permissions"]
            assert dashboard["metrics"] == [
                {"key": "documents.new", "count": 0},
                {"key": "schedule.today", "count": 0},
                {"key": "submissions.pending", "count": 0},
            ]
            assert dashboard["schedule_items"] == []
            assert dashboard["document_items"] == []
            assert dashboard["generated_at"]
    finally:
        await reset_database()
