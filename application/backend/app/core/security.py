from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

logger = logging.getLogger("my_gpt_api.core.security")

# auto_error=False → when SSO is disabled we must NOT force an Authorization
# header. With auto_error=True, FastAPI would reject header-less requests itself.
bearer_scheme = HTTPBearer(auto_error=False)

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
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[Dict[str, Any]]:
    """
    FastAPI dependency — validates the JWT Bearer token from the request.

    Behaviour depends on the AUTH_ENABLED setting:
      • AUTH_ENABLED=false → no-op, returns None (the API is open).
      • AUTH_ENABLED=true  → requires a valid Auth0 JWT, returns its claims.

    Usage in a route:
        async def my_route(user=Depends(verify_token)):
            ...

    Raises HTTP 401 on any validation failure (only when SSO is enabled).
    """
    settings = get_settings()

    # SSO switched off → let every request through without a token.
    if not settings.auth_enabled:
        return None

    # `jose` is only needed when SSO is on. Import it lazily so the backend can
    # still start without the dependency installed while auth is disabled.
    from jose import JWTError, jwt

    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # SSO on but no Authorization header was sent.
    if credentials is None:
        raise credentials_error

    token = credentials.credentials

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