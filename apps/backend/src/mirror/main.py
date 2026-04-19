import uvicorn

from mirror.core.config import get_settings


def run_api() -> None:
    s = get_settings()
    uvicorn.run(
        "mirror.api.app:app",
        host=s.api_host,
        port=s.api_port,
        reload=False,
    )
