from fastapi import APIRouter
from sqlalchemy import select

from schoolworkhub.models import School
from schoolworkhub.routers.auth import SessionDep
from schoolworkhub.schemas import ServerIdentityResponse

router = APIRouter(prefix="/api/v1/system", tags=["system"])


@router.get("/identity", response_model=ServerIdentityResponse)
async def read_server_identity(session: SessionDep) -> ServerIdentityResponse:
    school = await session.scalar(select(School).order_by(School.created_at, School.id).limit(1))
    if school is None:
        return ServerIdentityResponse(school_code=None, school_name=None)
    return ServerIdentityResponse(school_code=school.code, school_name=school.name)
