"""JWT verification: HS256 + asymmetric (JWKS) paths."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient
from jwt.algorithms import ECAlgorithm

from mirror.core.auth import (
    AuthUser,
    _cached_jwks_text,
    _decode_supabase_access_token,
    require_user,
)
from mirror.core.config import Settings, get_settings


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    get_settings.cache_clear()
    _cached_jwks_text.cache_clear()
    yield
    get_settings.cache_clear()
    _cached_jwks_text.cache_clear()


def _hs256_token(*, sub: str = "user-1", secret: str = "unit-test-hs256-secret-key-32b!!") -> str:
    exp = datetime.now(UTC) + timedelta(hours=1)
    return jwt.encode({"sub": sub, "exp": exp}, secret, algorithm="HS256")


def test_decode_hs256_success() -> None:
    secret = "unit-test-hs256-secret-key-32b!!"
    token = _hs256_token(secret=secret)
    settings = Settings(supabase_jwt_secret=secret, supabase_url="https://x.supabase.co")
    payload = _decode_supabase_access_token(token, settings)
    assert payload["sub"] == "user-1"


def test_decode_hs256_missing_secret_returns_500() -> None:
    token = _hs256_token(secret="secret")
    settings = Settings(supabase_jwt_secret="", supabase_url="https://x.supabase.co")
    with pytest.raises(HTTPException) as exc:
        _decode_supabase_access_token(token, settings)
    assert exc.value.status_code == 500
    assert "HS256" in (exc.value.detail or "")


def test_decode_hs256_wrong_secret_returns_401() -> None:
    token = _hs256_token(secret="a")
    settings = Settings(supabase_jwt_secret="b", supabase_url="https://x.supabase.co")
    with pytest.raises(HTTPException) as exc:
        _decode_supabase_access_token(token, settings)
    assert exc.value.status_code == 401


def test_decode_malformed_token_returns_401() -> None:
    settings = Settings(supabase_jwt_secret="x", supabase_url="https://x.supabase.co")
    with pytest.raises(HTTPException) as exc:
        _decode_supabase_access_token("not-a-jwt", settings)
    assert exc.value.status_code == 401


def test_decode_unsupported_alg_returns_401() -> None:
    secret = "unit-test-hs256-secret-key-32b!!"
    exp = datetime.now(UTC) + timedelta(hours=1)
    token = jwt.encode({"sub": "u", "exp": exp}, secret, algorithm="HS384")
    settings = Settings(supabase_jwt_secret=secret, supabase_url="https://x.supabase.co")
    with pytest.raises(HTTPException) as exc:
        _decode_supabase_access_token(token, settings)
    assert exc.value.status_code == 401
    assert "Unsupported JWT algorithm" in (exc.value.detail or "")


def test_decode_es256_with_mocked_jwks(monkeypatch: pytest.MonkeyPatch) -> None:
    _cached_jwks_text.cache_clear()
    priv = ec.generate_private_key(ec.SECP256R1())
    pub = priv.public_key()
    jwk_dict = ECAlgorithm.to_jwk(pub, as_dict=True)
    jwk_dict.update({"kid": "k1", "use": "sig", "alg": "ES256"})
    jwks_body = json.dumps({"keys": [jwk_dict]})

    base = "https://proj.supabase.co"
    issuer = f"{base}/auth/v1"
    exp = datetime.now(UTC) + timedelta(hours=1)
    token = jwt.encode(
        {"sub": "es-user", "iss": issuer, "exp": exp},
        priv,
        algorithm="ES256",
        headers={"kid": "k1"},
    )

    def _fake_jwks(_url: str) -> str:
        return jwks_body

    monkeypatch.setattr("mirror.core.auth._cached_jwks_text", _fake_jwks)

    settings = Settings(supabase_jwt_secret="", supabase_url=base)
    payload = _decode_supabase_access_token(token, settings)
    assert payload["sub"] == "es-user"


def test_require_user_fastapi_hs256(monkeypatch: pytest.MonkeyPatch) -> None:
    secret = "integration-secret-key-32bytes!!"
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    get_settings.cache_clear()

    token = _hs256_token(secret=secret, sub="fastapi-user")

    app = FastAPI()

    @app.get("/me")
    async def me(user: Annotated[AuthUser, Depends(require_user)]):
        return {"sub": user.sub}

    client = TestClient(app)
    res = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["sub"] == "fastapi-user"
