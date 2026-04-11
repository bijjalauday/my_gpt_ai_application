from __future__ import annotations

import json
import logging
from typing import AsyncGenerator, List

from openai import AsyncOpenAI, OpenAIError

from app.core.config import get_settings
from app.schemas.chat import ChatRequest, ChatResponse, Message, UsageInfo

logger = logging.getLogger("cortex.services.openai")


def _build_openai_messages(request: ChatRequest) -> List[dict]:
    """
    Combine an optional system prompt with the conversation history
    into the list of dicts that the OpenAI API expects.
    """
    messages: List[dict] = []

    if request.system_prompt and request.system_prompt.strip():
        messages.append({"role": "system", "content": request.system_prompt.strip()})

    for msg in request.messages:
        messages.append({"role": msg.role, "content": msg.content})

    return messages


def _get_client() -> AsyncOpenAI:
    """Return an AsyncOpenAI client using the API key from settings."""
    settings = get_settings()
    return AsyncOpenAI(api_key=settings.openai_api_key)


async def complete_chat(request: ChatRequest) -> ChatResponse:
    """
    Send a standard (non-streaming) chat completion request to OpenAI
    and return a structured ChatResponse.
    """
    client = _get_client()
    openai_messages = _build_openai_messages(request)

    logger.debug(
        "Sending completion request | model=%s temperature=%.2f max_tokens=%d",
        request.model,
        request.temperature,
        request.max_tokens,
    )

    try:
        response = await client.chat.completions.create(
            model=request.model,
            messages=openai_messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
    except OpenAIError as exc:
        logger.error("OpenAI API error: %s", exc)
        raise

    choice = response.choices[0]
    usage = response.usage

    return ChatResponse(
        id=response.id,
        model=response.model,
        content=choice.message.content or "",
        usage=UsageInfo(
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            total_tokens=usage.total_tokens,
        ),
    )


async def stream_chat(request: ChatRequest) -> AsyncGenerator[str, None]:
    """
    Send a streaming chat completion request.
    Yields Server-Sent Events (SSE) data lines that the frontend can consume.

    SSE format:
        data: {"delta": "token text"}\n\n
        data: [DONE]\n\n
    """
    client = _get_client()
    openai_messages = _build_openai_messages(request)

    logger.debug(
        "Sending streaming request | model=%s temperature=%.2f max_tokens=%d",
        request.model,
        request.temperature,
        request.max_tokens,
    )

    try:
        stream = await client.chat.completions.create(
            model=request.model,
            messages=openai_messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            stream=True,
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            # print(delta)
            if delta:
                payload = json.dumps({"delta": delta})
                # print(f"data: {payload}\n\n")
                yield f"data: {payload}\n\n"

        yield "data: [DONE]\n\n"

    except OpenAIError as exc:
        logger.error("OpenAI streaming error: %s", exc)
        error_payload = json.dumps({"error": str(exc)})
        yield f"data: {error_payload}\n\n"
