from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Literal
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from schoolworkhub.knowledge.models import KnowledgeStatus, KnowledgeVisibility

MAX_BODY_BYTES = 1_000_000
ALLOWED_NODE_TYPES = {
    "doc",
    "paragraph",
    "heading",
    "text",
    "bulletList",
    "orderedList",
    "listItem",
    "table",
    "tableRow",
    "tableCell",
    "blockquote",
    "image",
    "assignee",
    "relatedSchedule",
    "checklist",
    "checklistItem",
    "referenceDocument",
    "attachment",
    "sharedFile",
}
ALLOWED_MARK_TYPES = {"bold", "italic", "underline", "link"}
REFERENCE_ATTRS = {
    "assignee": "userId",
    "relatedSchedule": "scheduleId",
    "referenceDocument": "documentId",
    "attachment": "attachmentId",
    "sharedFile": "sharedFileId",
}


def _validate_url(value: str) -> None:
    parsed = urlparse(value)
    if parsed.scheme and parsed.scheme.lower() not in {"http", "https", "mailto"}:
        raise ValueError("unsupported URL scheme")


def _validate_uuid_attr(attrs: dict[str, Any], key: str) -> None:
    value = attrs.get(key)
    if not isinstance(value, str):
        raise ValueError(f"{key} is required")
    UUID(value)


def _validate_node(node: Any, *, depth: int = 0) -> None:
    if depth > 50:
        raise ValueError("document nesting is too deep")
    if not isinstance(node, dict):
        raise ValueError("document nodes must be objects")
    node_type = node.get("type")
    if node_type not in ALLOWED_NODE_TYPES:
        raise ValueError("unsupported document node")

    attrs = node.get("attrs", {})
    if not isinstance(attrs, dict):
        raise ValueError("node attrs must be an object")
    if any(str(key).lower().startswith("on") for key in attrs):
        raise ValueError("event attributes are not allowed")

    if node_type in REFERENCE_ATTRS:
        _validate_uuid_attr(attrs, REFERENCE_ATTRS[node_type])
    if node_type == "image":
        source = attrs.get("src")
        if not isinstance(source, str):
            raise ValueError("image src is required")
        _validate_url(source)

    marks = node.get("marks", [])
    if not isinstance(marks, list):
        raise ValueError("marks must be a list")
    for mark in marks:
        if not isinstance(mark, dict) or mark.get("type") not in ALLOWED_MARK_TYPES:
            raise ValueError("unsupported text mark")
        mark_attrs = mark.get("attrs", {})
        if not isinstance(mark_attrs, dict):
            raise ValueError("mark attrs must be an object")
        if any(str(key).lower().startswith("on") for key in mark_attrs):
            raise ValueError("event attributes are not allowed")
        if mark.get("type") == "link":
            href = mark_attrs.get("href")
            if not isinstance(href, str):
                raise ValueError("link href is required")
            _validate_url(href)

    content = node.get("content", [])
    if not isinstance(content, list):
        raise ValueError("node content must be a list")
    for child in content:
        _validate_node(child, depth=depth + 1)


def validate_structured_body(body: dict[str, Any]) -> dict[str, Any]:
    encoded = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()
    if len(encoded) > MAX_BODY_BYTES:
        raise ValueError("document body is too large")
    _validate_node(body)
    if body.get("type") != "doc":
        raise ValueError("document root must be doc")
    return body


def extract_search_text(title: str, body: dict[str, Any]) -> str:
    values: list[str] = [title.strip()]

    def visit(node: Any) -> None:
        if not isinstance(node, dict):
            return
        text = node.get("text")
        if isinstance(text, str):
            values.append(text.strip())
        attrs = node.get("attrs")
        if isinstance(attrs, dict):
            for key in ("label", "displayName", "title"):
                value = attrs.get(key)
                if isinstance(value, str):
                    values.append(value.strip())
        content = node.get("content")
        if isinstance(content, list):
            for child in content:
                visit(child)

    visit(body)
    return " ".join(value for value in values if value)


class KnowledgeDocumentWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=300)
    body: dict[str, Any]
    visibility: KnowledgeVisibility = KnowledgeVisibility.PRIVATE
    department_ids: list[UUID] = Field(default_factory=list, max_length=100)
    editor_ids: list[UUID] = Field(default_factory=list, max_length=100)
    tags: list[str] = Field(default_factory=list, max_length=30)
    is_important: bool = False
    change_reason: str | None = Field(default=None, max_length=500)

    @field_validator("body")
    @classmethod
    def validate_body(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_structured_body(value)

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            item = " ".join(value.split()).strip()
            if not item or len(item) > 80:
                raise ValueError("invalid tag")
            if item.casefold() not in {existing.casefold() for existing in normalized}:
                normalized.append(item)
        return normalized

    @model_validator(mode="after")
    def validate_visibility_targets(self) -> KnowledgeDocumentWrite:
        if self.visibility == KnowledgeVisibility.DEPARTMENTS and not self.department_ids:
            raise ValueError("department visibility requires at least one department")
        if self.visibility != KnowledgeVisibility.DEPARTMENTS and self.department_ids:
            raise ValueError("department targets require department visibility")
        return self


class CreateKnowledgeDocumentRequest(KnowledgeDocumentWrite):
    pass


class SaveKnowledgeDocumentRequest(KnowledgeDocumentWrite):
    revision: int = Field(ge=1)


class KnowledgeDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    school_id: UUID
    author_id: UUID
    current_version_id: UUID | None
    title: str
    body: dict[str, Any]
    status: KnowledgeStatus
    visibility: KnowledgeVisibility
    department_ids: list[UUID]
    editor_ids: list[UUID]
    tags: list[str]
    is_important: bool
    revision: int
    created_at: datetime
    updated_at: datetime


class KnowledgeDocumentListItem(BaseModel):
    id: UUID
    title: str
    status: KnowledgeStatus
    visibility: KnowledgeVisibility
    is_important: bool
    revision: int
    author_id: UUID
    updated_at: datetime


class KnowledgeDocumentListResponse(BaseModel):
    items: list[KnowledgeDocumentListItem]
    total: int


class KnowledgeDocumentQuery(BaseModel):
    status: KnowledgeStatus | None = None
    limit: int = Field(default=50, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


KnowledgeSaveAction = Literal["draft_save"]
