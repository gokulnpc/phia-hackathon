"""Supabase Auth JWT verification: HS256 (legacy JWT secret) or asymmetric (JWKS)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Any, cast

import certifi
import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKSet, PyJWTError
from jwt.exceptions import ExpiredSignatureError, PyJWKSetError

from mirror.core.config import Settings, get_settings

bearer_scheme = HTTPBearer(auto_error=False)

ASYMMETRIC_ALGS = frozenset({"ES256", "ES384", "ES512", "RS256", "RS384", "RS512"})

_DECODE_OPTIONS: dict[str, Any] = {"verify_aud": False, "require": ["exp", "sub"]}


@dataclass(frozen=True)
class AuthUser:
    sub: str


@lru_cache(maxsize=8)
def _cached_jwks_text(jwks_url: str) -> str:
    with httpx.Client(verify=certifi.where(), timeout=15.0) as client:
        response = client.get(jwks_url)
        response.raise_for_status()
    return response.text


def _invalid_token_http() -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        detail=(
            "Invalid token — for HS256 set SUPABASE_JWT_SECRET (legacy JWT secret); "
            "for asymmetric tokens ensure SUPABASE_URL matches the project (JWKS)."
        ),
    )


def _decode_hs256(token: str, secret: str) -> dict[str, Any]:
    try:
        return jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options=cast(Any, _DECODE_OPTIONS),
        )
    except ExpiredSignatureError:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Token expired; sign in again",
        ) from None
    except PyJWTError:
        raise _invalid_token_http() from None


def _decode_asymmetric(
    token: str,
    public_key: Any,
    alg: str,
    issuer: str,
) -> dict[str, Any]:
    try:
        return jwt.decode(
            token,
            public_key,
            algorithms=[alg],
            issuer=issuer,
            options=cast(Any, _DECODE_OPTIONS),
        )
    except ExpiredSignatureError:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Token expired; sign in again",
        ) from None
    except PyJWTError:
        raise _invalid_token_http() from None


def _decode_supabase_access_token(token: str, settings: Settings) -> dict[str, Any]:
    try:
        header = jwt.get_unverified_header(token)
    except PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from None

    alg = header.get("alg") or "HS256"
    kid = header.get("kid")

    if alg == "HS256":
        if not settings.supabase_jwt_secret:
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="SUPABASE_JWT_SECRET not configured for HS256 tokens",
            )
        return _decode_hs256(token, settings.supabase_jwt_secret)

    if alg not in ASYMMETRIC_ALGS:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail=f"Unsupported JWT algorithm: {alg}",
        )

    if not settings.supabase_url:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_URL not configured for JWKS verification",
        )

    if not kid:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing kid",
        )

    base = settings.supabase_url.rstrip("/")
    issuer = f"{base}/auth/v1"
    jwks_url = f"{base}/auth/v1/.well-known/jwks.json"

    try:
        jwks_text = _cached_jwks_text(jwks_url)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not fetch JWT signing keys from Supabase",
        ) from exc

    try:
        jwk_set = PyJWKSet.from_dict(json.loads(jwks_text))
    except (json.JSONDecodeError, PyJWKSetError, ValueError, TypeError) as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invalid JWKS response from Supabase",
        ) from exc

    try:
        signing_jwk = jwk_set[kid]
    except KeyError:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: unknown signing key",
        ) from None

    return _decode_asymmetric(token, signing_jwk.key, alg, issuer)


async def require_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> AuthUser:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    settings = get_settings()
    payload = _decode_supabase_access_token(creds.credentials, settings)
    sub = payload.get("sub")
    if not isinstance(sub, str):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")
    return AuthUser(sub=sub)
