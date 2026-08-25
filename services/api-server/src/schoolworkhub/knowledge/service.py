from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from schoolworkhub.knowledge.models import (
    KnowledgeDocument,
    KnowledgeDocumentVersion,
    KnowledgeStatus,
    KnowledgeVersionAction,
)
from schoolworkhub.knowledge.repository import KnowledgeRepository
from schoolworkhub.knowledge.schemas import (
    CreateKnowledgeDocumentRequest,
    KnowledgeDocumentListItem,
    KnowledgeDocumentListResponse,
    KnowledgeDocumentQuery,
    KnowledgeDocumentResponse,
    SaveKnowledgeDocumentRequest,
    extract_search_text,
)
from schoolworkhub.models import User


class KnowledgeService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repository = KnowledgeRepository(session)

    async def create_document(
        self, actor: User, command: CreateKnowledgeDocumentRequest
    ) -> KnowledgeDocumentResponse:
        document = KnowledgeDocument(
            school_id=actor.school_id,
            author_id=actor.id,
            title=command.title.strip(),
            search_text=extract_search_text(command.title, command.body),
            status=KnowledgeStatus.DRAFT,
            visibility=command.visibility,
            is_important=command.is_important,
            revision=1,
        )
        self.session.add(document)
        await self.session.flush()
        await self.repository.replace_departments(document, command.department_ids)
        await self.repository.replace_editors(document, command.editor_ids)
        await self.repository.replace_tags(document, command.tags)
        version = await self._create_version(
            document,
            actor,
            body=command.body,
            department_ids=command.department_ids,
            tags=command.tags,
            change_reason=command.change_reason,
        )
        document.current_version_id = version.id
        await self.session.commit()
        await self.session.refresh(document)
        return await self._response(document, body=command.body)

    async def save_draft(
        self,
        actor: User,
        document_id: UUID,
        command: SaveKnowledgeDocumentRequest,
    ) -> KnowledgeDocumentResponse:
        document = await self._get_required(actor.school_id, document_id)
        if not actor.is_superuser and document.author_id != actor.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="insufficient permission",
            )
        if document.revision != command.revision:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "KNOWLEDGE_REVISION_CONFLICT", "revision": document.revision},
            )
        document.title = command.title.strip()
        document.search_text = extract_search_text(command.title, command.body)
        document.visibility = command.visibility
        document.is_important = command.is_important
        document.status = KnowledgeStatus.DRAFT
        document.revision += 1
        await self.repository.replace_departments(document, command.department_ids)
        await self.repository.replace_editors(document, command.editor_ids)
        await self.repository.replace_tags(document, command.tags)
        version = await self._create_version(
            document,
            actor,
            body=command.body,
            department_ids=command.department_ids,
            tags=command.tags,
            change_reason=command.change_reason,
        )
        document.current_version_id = version.id
        await self.session.commit()
        await self.session.refresh(document)
        return await self._response(document, body=command.body)

    async def get_document(self, actor: User, document_id: UUID) -> KnowledgeDocumentResponse:
        document = await self._get_required(actor.school_id, document_id)
        version = await self.repository.get_version(actor.school_id, document.current_version_id)
        if version is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="document version missing",
            )
        return await self._response(document, body=version.body)

    async def list_documents(
        self, actor: User, query: KnowledgeDocumentQuery
    ) -> KnowledgeDocumentListResponse:
        documents, total = await self.repository.list_documents(
            actor.school_id,
            status=query.status,
            limit=query.limit,
            offset=query.offset,
        )
        return KnowledgeDocumentListResponse(
            items=[
                KnowledgeDocumentListItem(
                    id=document.id,
                    title=document.title,
                    status=document.status,
                    visibility=document.visibility,
                    is_important=document.is_important,
                    revision=document.revision,
                    author_id=document.author_id,
                    updated_at=document.updated_at,
                )
                for document in documents
            ],
            total=total,
        )

    async def _get_required(self, school_id: UUID, document_id: UUID) -> KnowledgeDocument:
        document = await self.repository.get_document(school_id, document_id)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")
        return document

    async def _create_version(
        self,
        document: KnowledgeDocument,
        actor: User,
        *,
        body: dict[str, object],
        department_ids: list[UUID],
        tags: list[str],
        change_reason: str | None,
    ) -> KnowledgeDocumentVersion:
        version = KnowledgeDocumentVersion(
            school_id=document.school_id,
            document_id=document.id,
            previous_version_id=document.current_version_id,
            created_by_id=actor.id,
            version_number=await self.repository.next_version_number(document.id),
            action=KnowledgeVersionAction.DRAFT_SAVE,
            title=document.title,
            body=body,
            search_text=document.search_text,
            visibility=document.visibility,
            department_ids=[str(value) for value in department_ids],
            tag_names=tags,
            change_reason=change_reason,
        )
        self.session.add(version)
        await self.session.flush()
        return version

    async def _response(
        self, document: KnowledgeDocument, *, body: dict[str, object]
    ) -> KnowledgeDocumentResponse:
        return KnowledgeDocumentResponse(
            id=document.id,
            school_id=document.school_id,
            author_id=document.author_id,
            current_version_id=document.current_version_id,
            title=document.title,
            body=body,
            status=document.status,
            visibility=document.visibility,
            department_ids=await self.repository.get_department_ids(document.id),
            editor_ids=await self.repository.get_editor_ids(document.id),
            tags=await self.repository.get_tag_names(document.id),
            is_important=document.is_important,
            revision=document.revision,
            created_at=document.created_at,
            updated_at=document.updated_at,
        )
