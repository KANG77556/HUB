from fastapi.testclient import TestClient

from schoolworkhub.main import create_app


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
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        me_response = client.get("/api/v1/auth/me", headers=headers)
        assert me_response.status_code == 200
        current_user = me_response.json()
        assert current_user["username"] == "admin"
        assert current_user["roles"] == ["administrator"]
        assert "system.admin" in current_user["permissions"]

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
