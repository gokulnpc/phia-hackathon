import time

from fastapi import APIRouter

_start = time.monotonic()

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "version": "0.1.0",
        "uptime_seconds": int(time.monotonic() - _start),
    }
