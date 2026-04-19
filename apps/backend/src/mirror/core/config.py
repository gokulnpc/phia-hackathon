from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    database_url: str = ""
    # Fash AI direct API (try-on v1.6). https://api.fashn.ai/v1/run
    fashn_api_key: str = ""
    gemini_api_key: str = ""
    # Image-capable Gemini model id (set in env; Google renames models frequently).
    gemini_avatar_model: str = ""
    # Optional post-FASHN editorial polish (try-on worker).
    # Empty → use gemini_avatar_model when enabled.
    gemini_tryon_editorial_model: str = ""
    # When true, try-on worker runs Gemini image enhancement after FASHN.
    tryon_editorial_enabled: bool = False
    # Vision model for extracting structured attributes from closet items.
    gemini_attributes_model: str = ""
    # Text+vision model that produces the fit-score JSON.
    gemini_fit_score_model: str = ""
    # Reverse search / "Worn by" — visual-search provider for external (non-Mirror) results.
    visual_search_provider: str = "mock"  # 'mock' | 'serpapi' | 'composite'
    # SerpAPI key (Google Lens). Required when visual_search_provider is 'serpapi' or 'composite'.
    serpapi_api_key: str = ""
    # Apify — Pinterest search + Instagram hashtag actors (composite provider).
    apify_api_token: str = ""
    apify_pinterest_actor_id: str = "scraperforge~pinterest-search-scraper"
    apify_instagram_actor_id: str = "apify~instagram-hashtag-scraper"
    visual_search_composite_per_provider_timeout_s: float = 25.0
    # Gemini model id for the batch person-detection filter on visual-search results.
    # Must be a text+vision model (e.g. gemini-2.5-flash) — NOT an image-generation model.
    gemini_person_filter_model: str = ""
    # Veo model id for try-on → video. Defaults to veo-3.1-fast-generate-preview
    # in mirror.integrations.gemini_video when unset.
    gemini_video_model: str = ""
    api_host: str = "0.0.0.0"
    # Railway always sets PORT. Prefer PORT over API_PORT so a stale API_PORT=8000
    # copied from local .env into Railway vars cannot override the platform port.
    api_port: int = Field(
        default=8000,
        validation_alias=AliasChoices("PORT", "API_PORT"),
    )
    app_version: str = "0.1.0"


@lru_cache
def get_settings() -> Settings:
    return Settings()
