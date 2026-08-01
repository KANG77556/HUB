from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from schoolworkhub.knowledge.models import (
    KnowledgeDocument,
    KnowledgeDocumentDepartment,
    KnowledgeDocumentEditor,
    KnowledgeDocumentTag,
    KnowledgeDocumentVersion,
    KnowledgeStatus,
    KnowledgeTag,
)


class KnowledgeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_document(self, school_id: UUID, document_id: UUID) -> KnowledgeDocument | None:
        result: KnowledgeDocument | None = await self.session.scalar(
            select(KnowledgeDocument).where(
                KnowledgeDocument.id == document_id,
                KnowledgeDocument.school_id == school_id,
                KnowledgeDocument.status != KnowledgeStatus.TRASHED,
            )
        )
        return result

    async def list_documents(
        self,
        school_id: UUID,
        *,
        status: KnowledgeStatus | None,
        limit: int,
        offset: int,
    ) -> tuple[Sequence[KnowledgeDocument], int]:
        filters = [KnowledgeDocument.school_id == school_id]
        if status is None:
            filters.append(KnowledgeDocument.status != KnowledgeStatus.TRASHED)
        else:
            filters.append(KnowledgeDocument.status == status)
        total = int(
            await self.session.scalar(
                select(func.count()).select_from(KnowledgeDocument).where(*filters)
            )
            or 0
        )
        rows = list(
            await self.session.scalars(
                select(KnowledgeDocument)
                .where(*filters)
                .order_by(KnowledgeDocument.updated_at.desc(), KnowledgeDocument.id)
                .limit(limit)
                .offset(offset)
            )
        )
        return rows, total

    async def get_version(
        self, school_id: UUID, version_id: UUID | None
    ) -> KnowledgeDocumentVersion | None:
        if version_id is None:
            return None
        result: KnowledgeDocumentVersion | None = await self.session.scalar(
            select(KnowledgeDocumentVersion).where(
                KnowledgeDocumentVersion.id == version_id,
                KnowledgeDocumentVersion.school_id == school_id,
            )
        )
        return result

    async def next_version_number(self, document_id: UUID) -> int:
        current = await self.session.scalar(
            select(func.max(KnowledgeDocumentVersion.version_number)).where(
                KnowledgeDocumentVersion.document_id == document_id
            )
        )
        return int(current or 0) + 1

    async def replace_departments(
        self, document: KnowledgeDocument, department_ids: list[UUID]
    ) -> None:
        await self.session.execute(
            delete(KnowledgeDocumentDepartment).where(
                KnowledgeDocumentDepartment.document_id == document.id
            )
        )
        self.session.add_all(
            KnowledgeDocumentDepartment(
                document_id=document.id,
                department_id=department_id,
                school_id=document.school_id,
            )
            for department_id in department_ids
        )

    async def replace_editors(self, document: KnowledgeDocument, editor_ids: list[UUID]) -> None:
        await self.session.execute(
            delete(KnowledgeDocumentEditor).where(
                KnowledgeDocumentEditor.document_id == document.id
            )
        )
        self.session.add_all(
            KnowledgeDocumentEditor(
                document_id=document.id,
                user_id=editor_id,
                school_id=document.school_id,
            )
            for editor_id in editor_ids
        )

    async def replace_tags(self, document: KnowledgeDocument, tag_names: list[str]) -> None:
        await self.session.execute(
            delete(KnowledgeDocumentTag).where(KnowledgeDocumentTag.document_id == document.id)
        )
        for name in tag_names:
            normalized_name = name.casefold()
            tag = await self.session.scalar(
                select(KnowledgeTag).where(
                    KnowledgeTag.school_id == document.school_id,
                    KnowledgeTag.normalized_name == normalized_name,
                )
            )
            if tag is None:
                tag = KnowledgeTag(
                    school_id=document.school_id,
                    name=name,
                    normalized_name=normalized_name,
                )
                self.session.add(tag)
                await self.session.flush()
            self.session.add(KnowledgeDocumentTag(document_id=document.id, tag_id=tag.id))

    async def get_department_ids(self, document_id: UUID) -> list[UUID]:
        return list(
            await self.session.scalars(
                select(KnowledgeDocumentDepartment.department_id)
                .where(KnowledgeDocumentDepartment.document_id == document_id)
                .order_by(KnowledgeDocumentDepartment.department_id)
            )
        )

    async def get_editor_ids(self, document_id: UUID) -> list[UUID]:
        return list(
            await self.session.scalars(
                select(KnowledgeDocumentEditor.user_id)
                .where(KnowledgeDocumentEditor.document_id == document_id)
                .order_by(KnowledgeDocumentEditor.user_id)
            )
        )

    async def get_tag_names(self, document_id: UUID) -> list[str]:
        return list(
            await self.session.scalars(
                select(KnowledgeTag.name)
                .join(KnowledgeDocumentTag, KnowledgeDocumentTag.tag_id == KnowledgeTag.id)
                .where(KnowledgeDocumentTag.document_id == document_id)
                .order_by(KnowledgeTag.normalized_name)
            )
        )
