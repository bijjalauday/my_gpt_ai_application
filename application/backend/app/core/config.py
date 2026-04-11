from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    All settings are read from environment variables (or a .env file).
    Nested model SettingsConfigDict ensures .env is loaded automatically.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ───────────────────────────────────────────────────────────────────
    app_env: str = "development"
    app_debug: bool = True
    app_title: str = "My GPT API"
    app_version: str = "1.0.0"

    # ── API ───────────────────────────────────────────────────────────────────
    api_v1_prefix: str = "/api/v1"
    openai_api_key: str = ""  # Must be set in .env or environment variable

    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]

    # ── OpenAI ────────────────────────────────────────────────────────────────
    openai_default_model: str = "gpt-3.5-turbo"
    openai_default_temperature: float = 0.7
    openai_default_max_tokens: int = 8000

    # ── Auth0 ─────────────────────────────────────────────────────────────────
    auth0_domain: str = ""
    auth0_audience: str = ""
    auth0_client_id: str = ""


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings instance (loaded once on first call)."""
    return Settings()
