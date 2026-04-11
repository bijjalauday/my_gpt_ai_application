from __future__ import annotations

import logging
from typing import Any, Dict

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import get_settings

logger = logging.getLogger("my_gpt_api.core.security")

# FastAPI security scheme — expects: Authorization: Bearer <token>
bearer_scheme = HTTPBearer()

# In-memory JWKS cache (refreshed lazily)
_jwks_cache: Dict[str, Any] = {}


async def _get_jwks() -> Dict[str, Any]:
    """
    Fetch Auth0 public keys (JWKS) to verify JWT signatures.
    Cached in memory after the first call.
    """
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache

    settings = get_settings()
    jwks_url = f"https://{settings.auth0_domain}/.well-known/jwks.json"

    async with httpx.AsyncClient() as client:
        response = await client.get(jwks_url, timeout=10)
        response.raise_for_status()
        _jwks_cache = response.json()
        logger.debug("JWKS keys loaded from Auth0")

    return _jwks_cache


async def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> Dict[str, Any]:
    """
    FastAPI dependency — validates the JWT Bearer token from the request.

    Usage in a route:
        async def my_route(user=Depends(verify_token)):
            ...

    Returns the decoded token payload (claims) on success.
    Raises HTTP 401 on any validation failure.
    """
    token = credentials.credentials
    settings = get_settings()

    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        jwks = await _get_jwks()

        # Decode the token header to find the key ID (kid)
        unverified_header = jwt.get_unverified_header(token)
        rsa_key = {}

        for key in jwks.get("keys", []):
            if key["kid"] == unverified_header.get("kid"):
                rsa_key = {
                    "kty": key["kty"],
                    "kid": key["kid"],
                    "use": key["use"],
                    "n":   key["n"],
                    "e":   key["e"],
                }
                break

        if not rsa_key:
            logger.warning("No matching RSA key found for kid=%s", unverified_header.get("kid"))
            raise credentials_error

        # Verify and decode the JWT
        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"],
            audience=settings.auth0_audience,
            issuer=f"https://{settings.auth0_domain}/",
        )
        return payload

    except JWTError as exc:
        logger.warning("JWT validation failed: %s", exc)
        raise credentials_error from exc
    except httpx.HTTPError as exc:
        logger.error("Failed to fetch JWKS from Auth0: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable",
        ) from exc
