from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from schoolworkhub.knowledge.models import KnowledgeStatus
from schoolworkhub.knowledge.schemas import (
    CreateKnowledgeDocumentRequest,
    KnowledgeDocumentListResponse,
    KnowledgeDocumentQuery,
    KnowledgeDocumentResponse,
    SaveKnowledgeDocumentRequest,
)
from schoolworkhub.knowledge.service import KnowledgeService
from schoolworkhub.models import User
from schoolworkhub.permissions import require_permission
from schoolworkhub.routers.auth import CurrentUserDep, SessionDep

router = APIRouter(prefix="/api/v1/knowledge", tags=["knowledge"])
CreateActorDep = Annotated[User, Depends(require_permission("knowledge.create"))]
ReadActorDep = Annotated[User, Depends(require_permission("knowledge.read"))]
EditActorDep = Annotated[User, Depends(require_permission("knowledge.edit.own"))]


@router.post("/documents", response_model=KnowledgeDocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    payload: CreateKnowledgeDocumentRequest,
    actor: CreateActorDep,
    session: SessionDep,
) -> KnowledgeDocumentResponse:
    return await KnowledgeService(session).create_document(actor, payload)


@router.get("/documents", response_model=KnowledgeDocumentListResponse)
async def list_documents(
    actor: ReadActorDep,
    session: SessionDep,
    document_status: Annotated[KnowledgeStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> KnowledgeDocumentListResponse:
    return await KnowledgeService(session).list_documents(
        actor,
        KnowledgeDocumentQuery(status=document_status, limit=limit, offset=offset),
    )


@router.get("/documents/{document_id}", response_model=KnowledgeDocumentResponse)
async def get_document(
    document_id: UUID,
    actor: ReadActorDep,
    session: SessionDep,
) -> KnowledgeDocumentResponse:
    return await KnowledgeService(session).get_document(actor, document_id)


@router.put("/documents/{document_id}/draft", response_model=KnowledgeDocumentResponse)
async def save_draft(
    document_id: UUID,
    payload: SaveKnowledgeDocumentRequest,
    actor: EditActorDep,
    session: SessionDep,
) -> KnowledgeDocumentResponse:
    return await KnowledgeService(session).save_draft(actor, document_id, payload)
