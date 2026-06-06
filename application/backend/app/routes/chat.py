from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.core.security import verify_token
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.openai_service import complete_chat, stream_chat

logger = logging.getLogger("cortex.routes.chat")

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post(
    "/completions",
    response_model=ChatResponse,
    summary="Chat completion (standard)",
    description=(
        "Send a conversation history to OpenAI and receive the assistant's reply. "
        "Set `stream: true` in the request body to switch to Server-Sent Events."
    ),
)
async def chat_completions(
    request: ChatRequest,
    user: Optional[Dict[str, Any]] = Depends(verify_token),
):
    """
    POST /api/v1/chat/completions

    - **Non-streaming**: returns a JSON `ChatResponse`.
    - **Streaming**: returns an `text/event-stream` SSE response.
    - When SSO is enabled (AUTH_ENABLED=true), requires a valid Auth0 Bearer token.
    """
    if user:
        logger.debug("Request from user sub=%s", user.get("sub"))

    if request.stream:
        return StreamingResponse(
            stream_chat(request),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    try:
        result = await complete_chat(request)
    except Exception as exc:
        logger.exception("Error during chat completion")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OpenAI API error: {exc}",
        ) from exc

    return result
