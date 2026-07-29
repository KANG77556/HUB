from fastapi.testclient import TestClient

from schoolworkhub.main import create_app


def test_bootstrap_login_and_current_user() -> None:
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

        me_response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert me_response.status_code == 200
    current_user = me_response.json()
    assert current_user["username"] == "admin"
    assert current_user["roles"] == ["administrator"]
    assert "system.admin" in current_user["permissions"]
