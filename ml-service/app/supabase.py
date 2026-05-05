# Lazy Supabase client so the tagger module can be imported and tested
# without a live SUPABASE_URL.
from . import config

_db = None


def get_db():
    global _db
    if _db is None:
        from supabase import create_client
        url = config.require("SUPABASE_URL", config.SUPABASE_URL)
        key = config.require("SUPABASE_SERVICE_ROLE_KEY", config.SUPABASE_SERVICE_ROLE_KEY)
        _db = create_client(url, key)
    return _db
