from fastapi import APIRouter, HTTPException

from app.models.schemas import ChatRequest, ChatResponse
from app.services import chat_service

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/", response_model=ChatResponse, response_model_by_alias=True)
async def chat(request: ChatRequest):
    if not request.api_key:
        raise HTTPException(status_code=400, detail="API key is required")
    try:
        return await chat_service.chat(request)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
