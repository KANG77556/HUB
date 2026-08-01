from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from schoolworkhub.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class KnowledgeStatus(StrEnum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    REJECTED = "rejected"
    PUBLISHED = "published"
    UNPUBLISHED = "unpublished"
    TRASHED = "trashed"


class KnowledgeVisibility(StrEnum):
    PRIVATE = "private"
    DEPARTMENTS = "departments"
    SCHOOL = "school"


class KnowledgeVersionAction(StrEnum):
    DRAFT_SAVE = "draft_save"
    PUBLISH = "publish"
    APPROVAL_PUBLISH = "approval_publish"
    RESTORE = "restore"


class ApprovalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class AttachmentStatus(StrEnum):
    STAGED = "staged"
    READY = "ready"
    DELETED = "deleted"


class KnowledgeDocument(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_documents"
    __table_args__ = (
        CheckConstraint("revision >= 1", name="ck_knowledge_documents_revision_positive"),
        Index("ix_knowledge_documents_school_status_updated", "school_id", "status", "updated_at"),
        Index("ix_knowledge_documents_school_author", "school_id", "author_id"),
    )

    school_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    current_version_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    search_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[KnowledgeStatus] = mapped_column(
        Enum(KnowledgeStatus, native_enum=False, length=40),
        nullable=False,
        default=KnowledgeStatus.DRAFT,
        index=True,
    )
    visibility: Mapped[KnowledgeVisibility] = mapped_column(
        Enum(KnowledgeVisibility, native_enum=False, length=20),
        nullable=False,
        default=KnowledgeVisibility.PRIVATE,
        index=True,
    )
    is_important: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    purge_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    retention_hold: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class KnowledgeDocumentVersion(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "knowledge_document_versions"
    __table_args__ = (
        UniqueConstraint("document_id", "version_number", name="uq_knowledge_version_number"),
        CheckConstraint("version_number >= 1", name="ck_knowledge_version_number_positive"),
    )

    school_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    previous_version_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("knowledge_document_versions.id", ondelete="SET NULL"), nullable=True
    )
    created_by_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[KnowledgeVersionAction] = mapped_column(
        Enum(KnowledgeVersionAction, native_enum=False, length=30), nullable=False
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    search_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    visibility: Mapped[KnowledgeVisibility] = mapped_column(
        Enum(KnowledgeVisibility, native_enum=False, length=20), nullable=False
    )
    department_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    tag_names: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    change_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()", index=True
    )


class KnowledgeDocumentEditor(Base):
    __tablename__ = "knowledge_document_editors"
    __table_args__ = (
        UniqueConstraint("document_id", "user_id", name="uq_knowledge_document_editor"),
    )

    document_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("knowledge_documents.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    school_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True
    )


class KnowledgeDocumentDepartment(Base):
    __tablename__ = "knowledge_document_departments"

    document_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("knowledge_documents.id", ondelete="CASCADE"), primary_key=True
    )
    department_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True
    )
    school_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True
    )


class KnowledgeTag(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_tags"
    __table_args__ = (UniqueConstraint("school_id", "normalized_name", name="uq_knowledge_tag_school_name"),)

    school_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(80), nullable=False)


class KnowledgeDocumentTag(Base):
    __tablename__ = "knowledge_document_tags"

    document_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("knowledge_documents.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("knowledge_tags.id", ondelete="CASCADE"), primary_key=True
    )


class KnowledgeAutosaveDraft(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_autosave_drafts"
    __table_args__ = (
        UniqueConstraint("document_id", "user_id", name="uq_knowledge_autosave_user_document"),
        CheckConstraint("base_revision >= 1", name="ck_knowledge_autosave_revision_positive"),
    )

    school_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    base_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    visibility: Mapped[KnowledgeVisibility] = mapped_column(
        Enum(KnowledgeVisibility, native_enum=False, length=20), nullable=False
    )
    metadata_payload: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)


class KnowledgeApprovalRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_approval_requests"

    school_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_version_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("knowledge_document_versions.id", ondelete="RESTRICT"), nullable=False
    )
    requested_by_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    decided_by_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[ApprovalStatus] = mapped_column(
        Enum(ApprovalStatus, native_enum=False, length=20),
        nullable=False,
        default=ApprovalStatus.PENDING,
        index=True,
    )
    reason: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class KnowledgeAttachment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_attachments"

    school_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    uploaded_by_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    content_type: Mapped[str] = mapped_column(String(150), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[AttachmentStatus] = mapped_column(
        Enum(AttachmentStatus, native_enum=False, length=20), nullable=False, default=AttachmentStatus.STAGED
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class KnowledgeVersionAttachment(Base):
    __tablename__ = "knowledge_version_attachments"

    version_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("knowledge_document_versions.id", ondelete="CASCADE"), primary_key=True
    )
    attachment_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("knowledge_attachments.id", ondelete="RESTRICT"), primary_key=True
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(150), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)


class KnowledgeSharedFileLink(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_shared_file_links"
    __table_args__ = (
        UniqueConstraint("document_id", "shared_file_id", name="uq_knowledge_shared_file_link"),
    )

    school_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    shared_file_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    linked_by_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    snapshot_name: Mapped[str] = mapped_column(String(255), nullable=False)
    snapshot_version: Mapped[str | None] = mapped_column(String(100), nullable=True)


class KnowledgePin(Base):
    __tablename__ = "knowledge_pins"

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    document_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("knowledge_documents.id", ondelete="CASCADE"), primary_key=True
    )
    school_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default="now()"
    )
