from __future__ import annotations

from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas.chat import HealthResponse

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Returns the current health status and environment of the API.",
)
async def health_check() -> HealthResponse:
    """GET /api/v1/health — liveness probe."""
    settings = get_settings()
    return HealthResponse(
        status="ok",
        version=settings.app_version,
        environment=settings.app_env,
    )
