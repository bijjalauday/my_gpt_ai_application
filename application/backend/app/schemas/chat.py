from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


# ── Message ───────────────────────────────────────────────────────────────────

class Message(BaseModel):
    """A single chat message (mirrors OpenAI message format)."""

    role: Literal["system", "user", "assistant"] = Field(
        ..., description="Role of the message author"
    )
    content: str = Field(..., min_length=1, description="Message text content")


# ── Requests ──────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    """Request body for POST /chat/completions."""

    messages: List[Message] = Field(
        ...,
        min_length=1,
        description="Conversation history ending with the latest user message",
    )
    model: str = Field(
        default="gpt-3.5-turbo",
        description="OpenAI model identifier",
    )
    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=2.0,
        description="Sampling temperature (0 = deterministic, 2 = very random)",
    )
    max_tokens: int = Field(
        default=8000,
        ge=1,
        le=128000,
        description="Maximum tokens in the completion",
    )
    system_prompt: Optional[str] = Field(
        default=None,
        description="Optional system-level instruction injected before conversation",
    )
    stream: bool = Field(
        default=False,
        description="Enable Server-Sent Events streaming",
    )


# ── Responses ─────────────────────────────────────────────────────────────────

class UsageInfo(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class ChatResponse(BaseModel):
    """Response body for non-streaming chat completions."""

    id: str = Field(..., description="OpenAI completion ID")
    model: str
    content: str = Field(..., description="Assistant reply text")
    usage: UsageInfo


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    environment: str
