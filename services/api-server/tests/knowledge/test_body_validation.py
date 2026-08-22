from uuid import uuid4

import pytest
from pydantic import ValidationError

from schoolworkhub.knowledge.schemas import (
    CreateKnowledgeDocumentRequest,
    extract_search_text,
)


def valid_body() -> dict[str, object]:
    return {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "업무 안내"}],
            },
            {
                "type": "checklist",
                "content": [
                    {
                        "type": "checklistItem",
                        "attrs": {"label": "담당자 확인"},
                    }
                ],
            },
            {
                "type": "assignee",
                "attrs": {"userId": str(uuid4()), "displayName": "김교사"},
            },
        ],
    }


def make_request(body: dict[str, object]) -> CreateKnowledgeDocumentRequest:
    return CreateKnowledgeDocumentRequest(title="교무 업무", body=body)


def test_accepts_approved_formatting_and_work_blocks() -> None:
    request = make_request(valid_body())
    assert request.body["type"] == "doc"
    assert extract_search_text(request.title, request.body) == (
        "교무 업무 업무 안내 담당자 확인 김교사"
    )


@pytest.mark.parametrize(
    "body",
    [
        {"type": "doc", "content": [{"type": "script"}]},
        {"type": "doc", "attrs": {"onclick": "alert(1)"}},
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "위험 링크",
                            "marks": [
                                {
                                    "type": "link",
                                    "attrs": {"href": "javascript:alert(1)"},
                                }
                            ],
                        }
                    ],
                }
            ],
        },
        {"type": "doc", "content": [{"type": "assignee", "attrs": {"userId": "x"}}]},
    ],
)
def test_rejects_unsafe_or_invalid_nodes(body: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        make_request(body)


def test_department_visibility_requires_targets() -> None:
    with pytest.raises(ValidationError):
        CreateKnowledgeDocumentRequest(
            title="부서 문서",
            body=valid_body(),
            visibility="departments",
        )
