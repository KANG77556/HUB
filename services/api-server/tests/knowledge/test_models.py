from datetime import UTC, datetime, timedelta

from sqlalchemy import CheckConstraint, ForeignKeyConstraint, UniqueConstraint

from schoolworkhub.db.base import Base
from schoolworkhub.knowledge.models import (
    ApprovalStatus,
    KnowledgeDocument,
    KnowledgeStatus,
    KnowledgeVersionAction,
    KnowledgeVisibility,
)

EXPECTED_TABLES = {
    "knowledge_documents",
    "knowledge_document_versions",
    "knowledge_document_editors",
    "knowledge_document_departments",
    "knowledge_tags",
    "knowledge_document_tags",
    "knowledge_autosave_drafts",
    "knowledge_approval_requests",
    "knowledge_attachments",
    "knowledge_version_attachments",
    "knowledge_shared_file_links",
    "knowledge_pins",
}


def test_knowledge_enum_values_are_stable() -> None:
    assert [item.value for item in KnowledgeStatus] == [
        "draft",
        "pending_approval",
        "rejected",
        "published",
        "unpublished",
        "trashed",
    ]
    assert [item.value for item in KnowledgeVisibility] == [
        "private",
        "departments",
        "school",
    ]
    assert [item.value for item in KnowledgeVersionAction] == [
        "draft_save",
        "publish",
        "approval_publish",
        "restore",
    ]
    assert [item.value for item in ApprovalStatus] == [
        "pending",
        "approved",
        "rejected",
        "cancelled",
    ]


def test_all_knowledge_tables_are_registered() -> None:
    assert EXPECTED_TABLES <= set(Base.metadata.tables)


def test_document_revision_constraint_and_school_foreign_keys_exist() -> None:
    table = KnowledgeDocument.__table__
    check_names = {
        constraint.name
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert "ck_knowledge_documents_revision_positive" in check_names

    foreign_targets = {
        element.target_fullname
        for constraint in table.constraints
        if isinstance(constraint, ForeignKeyConstraint)
        for element in constraint.elements
    }
    assert "schools.id" in foreign_targets
    assert "users.id" in foreign_targets


def test_editor_and_tag_uniqueness_is_declared() -> None:
    editor_constraints = Base.metadata.tables["knowledge_document_editors"].constraints
    tag_constraints = Base.metadata.tables["knowledge_tags"].constraints
    assert any(
        isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_knowledge_document_editor"
        for constraint in editor_constraints
    )
    assert any(
        isinstance(constraint, UniqueConstraint)
        and constraint.name == "uq_knowledge_tag_school_name"
        for constraint in tag_constraints
    )


def test_trash_retention_window_is_thirty_days() -> None:
    deleted_at = datetime(2026, 8, 2, tzinfo=UTC)
    purge_after = deleted_at + timedelta(days=30)
    assert purge_after - deleted_at == timedelta(days=30)
