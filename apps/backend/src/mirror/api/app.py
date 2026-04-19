from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from mirror.api.routers import (
    avatar,
    catalog,
    closet,
    fit_score,
    health,
    price,
    reverse_search,
    tryon,
)
from mirror.core.logging_config import configure_logging


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_logging()
    yield


app = FastAPI(title="Mirror API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(tryon.router, prefix="/api/v1")
app.include_router(avatar.router, prefix="/api/v1")
app.include_router(catalog.router, prefix="/api/v1")
app.include_router(closet.router, prefix="/api/v1")
app.include_router(price.router, prefix="/api/v1")
app.include_router(fit_score.router, prefix="/api/v1")
app.include_router(reverse_search.router, prefix="/api/v1")
