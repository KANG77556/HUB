"""Add internal knowledge-document schema.

Revision ID: 0003_knowledge_documents
Revises: 0002_refresh_sessions
Create Date: 2026-08-02
"""
from collections.abc import Sequence
from uuid import UUID

import sqlalchemy as sa
from alembic import op

revision: str = "0003_knowledge_documents"
down_revision: str | None = "0002_refresh_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PERMISSIONS = (
    ("31b1d1a0-9131-4e76-9001-000000000001", "knowledge.read", "지식 문서 열람"),
    ("31b1d1a0-9131-4e76-9001-000000000002", "knowledge.create", "지식 문서 작성"),
    ("31b1d1a0-9131-4e76-9001-000000000003", "knowledge.edit.own", "본인 지식 문서 편집"),
    ("31b1d1a0-9131-4e76-9001-000000000004", "knowledge.edit.assigned", "지정 지식 문서 편집"),
    ("31b1d1a0-9131-4e76-9001-000000000005", "knowledge.publish", "지식 문서 발행"),
    ("31b1d1a0-9131-4e76-9001-000000000006", "knowledge.approve", "중요 지식 문서 승인"),
    ("31b1d1a0-9131-4e76-9001-000000000007", "knowledge.delete", "지식 문서 삭제"),
    ("31b1d1a0-9131-4e76-9001-000000000008", "knowledge.restore", "지식 문서 복구"),
    ("31b1d1a0-9131-4e76-9001-000000000009", "knowledge.history.read", "지식 문서 이력 열람"),
    ("31b1d1a0-9131-4e76-9001-000000000010", "knowledge.history.restore", "지식 문서 버전 복원"),
    (
        "31b1d1a0-9131-4e76-9001-000000000011",
        "knowledge.manage.shared_files",
        "지식 문서 공용 파일 연결 관리",
    ),
)


def timestamp_columns() -> tuple[sa.Column[sa.DateTime], sa.Column[sa.DateTime]]:
    return (
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def upgrade() -> None:
    op.create_table(
        "knowledge_documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("current_version_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("search_text", sa.Text(), server_default="", nullable=False),
        sa.Column("status", sa.String(length=40), server_default="draft", nullable=False),
        sa.Column("visibility", sa.String(length=20), server_default="private", nullable=False),
        sa.Column("is_important", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("purge_after", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retention_hold", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        *timestamp_columns(),
        sa.CheckConstraint("revision >= 1", name="ck_knowledge_documents_revision_positive"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_knowledge_documents_school_id", "knowledge_documents", ["school_id"])
    op.create_index("ix_knowledge_documents_author_id", "knowledge_documents", ["author_id"])
    op.create_index("ix_knowledge_documents_status", "knowledge_documents", ["status"])
    op.create_index("ix_knowledge_documents_visibility", "knowledge_documents", ["visibility"])
    op.create_index("ix_knowledge_documents_purge_after", "knowledge_documents", ["purge_after"])
    op.create_index(
        "ix_knowledge_documents_school_status_updated",
        "knowledge_documents",
        ["school_id", "status", "updated_at"],
    )
    op.create_index(
        "ix_knowledge_documents_school_author",
        "knowledge_documents",
        ["school_id", "author_id"],
    )
    op.execute(
        "CREATE INDEX ix_knowledge_documents_search_vector ON knowledge_documents "
        "USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(search_text, '')))"
    )

    op.create_table(
        "knowledge_document_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("previous_version_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("body", sa.JSON(), nullable=False),
        sa.Column("search_text", sa.Text(), server_default="", nullable=False),
        sa.Column("visibility", sa.String(length=20), nullable=False),
        sa.Column("department_ids", sa.JSON(), nullable=False),
        sa.Column("tag_names", sa.JSON(), nullable=False),
        sa.Column("change_reason", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("version_number >= 1", name="ck_knowledge_version_number_positive"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["document_id"], ["knowledge_documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["previous_version_id"],
            ["knowledge_document_versions.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "version_number", name="uq_knowledge_version_number"),
    )
    op.create_index(
        "ix_knowledge_document_versions_document_id",
        "knowledge_document_versions",
        ["document_id"],
    )
    op.create_index(
        "ix_knowledge_document_versions_school_id",
        "knowledge_document_versions",
        ["school_id"],
    )
    op.create_index(
        "ix_knowledge_document_versions_created_at",
        "knowledge_document_versions",
        ["created_at"],
    )
    op.create_foreign_key(
        "fk_knowledge_documents_current_version",
        "knowledge_documents",
        "knowledge_document_versions",
        ["current_version_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "knowledge_document_editors",
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["knowledge_documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("document_id", "user_id"),
        sa.UniqueConstraint("document_id", "user_id", name="uq_knowledge_document_editor"),
    )
    op.create_index(
        "ix_knowledge_document_editors_school_id",
        "knowledge_document_editors",
        ["school_id"],
    )

    op.create_table(
        "knowledge_document_departments",
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("department_id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["knowledge_documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("document_id", "department_id"),
    )
    op.create_index(
        "ix_knowledge_document_departments_school_id",
        "knowledge_document_departments",
        ["school_id"],
    )

    op.create_table(
        "knowledge_tags",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("normalized_name", sa.String(length=80), nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school_id", "normalized_name", name="uq_knowledge_tag_school_name"),
    )
    op.create_index("ix_knowledge_tags_school_id", "knowledge_tags", ["school_id"])

    op.create_table(
        "knowledge_document_tags",
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("tag_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["knowledge_documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["knowledge_tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("document_id", "tag_id"),
    )

    op.create_table(
        "knowledge_autosave_drafts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("base_revision", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("body", sa.JSON(), nullable=False),
        sa.Column("visibility", sa.String(length=20), nullable=False),
        sa.Column("metadata_payload", sa.JSON(), nullable=False),
        *timestamp_columns(),
        sa.CheckConstraint("base_revision >= 1", name="ck_knowledge_autosave_revision_positive"),
        sa.ForeignKeyConstraint(["document_id"], ["knowledge_documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "user_id", name="uq_knowledge_autosave_user_document"),
    )
    op.create_index(
        "ix_knowledge_autosave_drafts_document_id",
        "knowledge_autosave_drafts",
        ["document_id"],
    )
    op.create_index(
        "ix_knowledge_autosave_drafts_school_id", "knowledge_autosave_drafts", ["school_id"]
    )
    op.create_index(
        "ix_knowledge_autosave_drafts_user_id", "knowledge_autosave_drafts", ["user_id"]
    )

    op.create_table(
        "knowledge_approval_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("document_version_id", sa.Uuid(), nullable=False),
        sa.Column("requested_by_id", sa.Uuid(), nullable=False),
        sa.Column("decided_by_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("reason", sa.String(length=1000), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["decided_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["document_id"], ["knowledge_documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["document_version_id"], ["knowledge_document_versions.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["requested_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_knowledge_approval_requests_document_id",
        "knowledge_approval_requests",
        ["document_id"],
    )
    op.create_index(
        "ix_knowledge_approval_requests_school_id",
        "knowledge_approval_requests",
        ["school_id"],
    )
    op.create_index(
        "ix_knowledge_approval_requests_status", "knowledge_approval_requests", ["status"]
    )

    op.create_table(
        "knowledge_attachments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("uploaded_by_id", sa.Uuid(), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=False),
        sa.Column("content_type", sa.String(length=150), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="staged", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["document_id"], ["knowledge_documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key"),
    )
    op.create_index(
        "ix_knowledge_attachments_document_id", "knowledge_attachments", ["document_id"]
    )
    op.create_index("ix_knowledge_attachments_school_id", "knowledge_attachments", ["school_id"])

    op.create_table(
        "knowledge_version_attachments",
        sa.Column("version_id", sa.Uuid(), nullable=False),
        sa.Column("attachment_id", sa.Uuid(), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=150), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(
            ["attachment_id"], ["knowledge_attachments.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["version_id"], ["knowledge_document_versions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("version_id", "attachment_id"),
    )

    op.create_table(
        "knowledge_shared_file_links",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("shared_file_id", sa.Uuid(), nullable=False),
        sa.Column("linked_by_id", sa.Uuid(), nullable=False),
        sa.Column("snapshot_name", sa.String(length=255), nullable=False),
        sa.Column("snapshot_version", sa.String(length=100), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["document_id"], ["knowledge_documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["linked_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "shared_file_id", name="uq_knowledge_shared_file_link"),
    )
    op.create_index(
        "ix_knowledge_shared_file_links_document_id",
        "knowledge_shared_file_links",
        ["document_id"],
    )
    op.create_index(
        "ix_knowledge_shared_file_links_school_id", "knowledge_shared_file_links", ["school_id"]
    )

    op.create_table(
        "knowledge_pins",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["document_id"], ["knowledge_documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "document_id"),
    )
    op.create_index("ix_knowledge_pins_school_id", "knowledge_pins", ["school_id"])

    permission_table = sa.table(
        "permissions",
        sa.column("id", sa.Uuid()),
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
    )
    op.bulk_insert(
        permission_table,
        [{"id": UUID(permission_id), "code": code, "name": name} for permission_id, code, name in PERMISSIONS],
    )


def downgrade() -> None:
    permission_codes = ", ".join(f"'{code}'" for _, code, _ in PERMISSIONS)
    op.execute(sa.text(f"DELETE FROM permissions WHERE code IN ({permission_codes})"))
    op.drop_index("ix_knowledge_pins_school_id", table_name="knowledge_pins")
    op.drop_table("knowledge_pins")
    op.drop_index("ix_knowledge_shared_file_links_school_id", table_name="knowledge_shared_file_links")
    op.drop_index("ix_knowledge_shared_file_links_document_id", table_name="knowledge_shared_file_links")
    op.drop_table("knowledge_shared_file_links")
    op.drop_table("knowledge_version_attachments")
    op.drop_index("ix_knowledge_attachments_school_id", table_name="knowledge_attachments")
    op.drop_index("ix_knowledge_attachments_document_id", table_name="knowledge_attachments")
    op.drop_table("knowledge_attachments")
    op.drop_index("ix_knowledge_approval_requests_status", table_name="knowledge_approval_requests")
    op.drop_index("ix_knowledge_approval_requests_school_id", table_name="knowledge_approval_requests")
    op.drop_index("ix_knowledge_approval_requests_document_id", table_name="knowledge_approval_requests")
    op.drop_table("knowledge_approval_requests")
    op.drop_index("ix_knowledge_autosave_drafts_user_id", table_name="knowledge_autosave_drafts")
    op.drop_index("ix_knowledge_autosave_drafts_school_id", table_name="knowledge_autosave_drafts")
    op.drop_index("ix_knowledge_autosave_drafts_document_id", table_name="knowledge_autosave_drafts")
    op.drop_table("knowledge_autosave_drafts")
    op.drop_table("knowledge_document_tags")
    op.drop_index("ix_knowledge_tags_school_id", table_name="knowledge_tags")
    op.drop_table("knowledge_tags")
    op.drop_index("ix_knowledge_document_departments_school_id", table_name="knowledge_document_departments")
    op.drop_table("knowledge_document_departments")
    op.drop_index("ix_knowledge_document_editors_school_id", table_name="knowledge_document_editors")
    op.drop_table("knowledge_document_editors")
    op.drop_constraint(
        "fk_knowledge_documents_current_version", "knowledge_documents", type_="foreignkey"
    )
    op.drop_index("ix_knowledge_document_versions_created_at", table_name="knowledge_document_versions")
    op.drop_index("ix_knowledge_document_versions_school_id", table_name="knowledge_document_versions")
    op.drop_index("ix_knowledge_document_versions_document_id", table_name="knowledge_document_versions")
    op.drop_table("knowledge_document_versions")
    op.execute("DROP INDEX IF EXISTS ix_knowledge_documents_search_vector")
    op.drop_index("ix_knowledge_documents_school_author", table_name="knowledge_documents")
    op.drop_index("ix_knowledge_documents_school_status_updated", table_name="knowledge_documents")
    op.drop_index("ix_knowledge_documents_purge_after", table_name="knowledge_documents")
    op.drop_index("ix_knowledge_documents_visibility", table_name="knowledge_documents")
    op.drop_index("ix_knowledge_documents_status", table_name="knowledge_documents")
    op.drop_index("ix_knowledge_documents_author_id", table_name="knowledge_documents")
    op.drop_index("ix_knowledge_documents_school_id", table_name="knowledge_documents")
    op.drop_table("knowledge_documents")
