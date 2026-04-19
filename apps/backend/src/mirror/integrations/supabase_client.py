from supabase import Client, create_client

from mirror.core.config import Settings


def create_service_client(settings: Settings) -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("Supabase service client requires URL and service role key")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
