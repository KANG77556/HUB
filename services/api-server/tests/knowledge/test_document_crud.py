from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from schoolworkhub.db.session import engine
from schoolworkhub.main import create_app


async def reset_database() -> None:
    await engine.dispose()
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "TRUNCATE TABLE knowledge_pins, knowledge_shared_file_links, "
                "knowledge_version_attachments, knowledge_attachments, "
                "knowledge_approval_requests, knowledge_autosave_drafts, "
                "knowledge_document_tags, knowledge_tags, "
                "knowledge_document_departments, knowledge_document_editors, "
                "knowledge_document_versions, knowledge_documents, audit_logs, "
                "refresh_sessions, role_permissions, user_roles, users, roles, "
                "permissions, departments, schools RESTART IDENTITY CASCADE"
            )
        )
    await engine.dispose()


def body(text_value: str) -> dict[str, object]:
    return {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": text_value}],
            }
        ],
    }


async def test_create_read_list_and_save_draft() -> None:
    await reset_database()
    try:
        transport = ASGITransport(app=create_app())
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            bootstrap = await client.post(
                "/api/v1/setup/bootstrap",
                json={
                    "school_code": "sample-school",
                    "school_name": "샘플학교",
                    "admin_username": "admin",
                    "admin_display_name": "최고관리자",
                    "admin_password": "Correct-Horse-Battery-Staple",
                },
            )
            assert bootstrap.status_code == 201

            login = await client.post(
                "/api/v1/auth/login",
                json={
                    "school_code": "sample-school",
                    "username": "admin",
                    "password": "Correct-Horse-Battery-Staple",
                },
            )
            assert login.status_code == 200
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

            created = await client.post(
                "/api/v1/knowledge/documents",
                headers=headers,
                json={
                    "title": "교무 업무 안내",
                    "body": body("최초 내용"),
                    "visibility": "private",
                    "department_ids": [],
                    "editor_ids": [],
                    "tags": ["교무", "안내"],
                    "is_important": False,
                    "change_reason": "최초 작성",
                },
            )
            assert created.status_code == 201
            document = created.json()
            assert document["status"] == "draft"
            assert document["revision"] == 1
            assert document["tags"] == ["안내", "교무"]
            assert document["current_version_id"]

            detail = await client.get(
                f"/api/v1/knowledge/documents/{document['id']}",
                headers=headers,
            )
            assert detail.status_code == 200
            assert detail.json()["body"] == body("최초 내용")

            listing = await client.get("/api/v1/knowledge/documents", headers=headers)
            assert listing.status_code == 200
            assert listing.json()["total"] == 1
            assert listing.json()["items"][0]["title"] == "교무 업무 안내"

            saved = await client.put(
                f"/api/v1/knowledge/documents/{document['id']}/draft",
                headers=headers,
                json={
                    "revision": 1,
                    "title": "교무 업무 안내 수정",
                    "body": body("수정 내용"),
                    "visibility": "school",
                    "department_ids": [],
                    "editor_ids": [],
                    "tags": ["교무"],
                    "is_important": True,
                    "change_reason": "내용 보완",
                },
            )
            assert saved.status_code == 200
            saved_document = saved.json()
            assert saved_document["revision"] == 2
            assert saved_document["title"] == "교무 업무 안내 수정"
            assert saved_document["body"] == body("수정 내용")
            assert saved_document["current_version_id"] != document["current_version_id"]
    finally:
        await reset_database()
