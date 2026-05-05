# Settings pulled from .env. Missing values are tolerated up front so we
# can smoke-test the tagger without Supabase creds; anything that actually
# needs a real value will blow up at first use via require().
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).parent.parent

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

MODEL_DIR = Path(os.environ.get("MODEL_DIR", ROOT / "models"))
TAGGER_MODEL = os.environ.get("TAGGER_MODEL", "tagger_v1.joblib")
TAG_THRESHOLD = float(os.environ.get("TAG_THRESHOLD", "0.45"))
TAG_MAX_OUT = int(os.environ.get("TAG_MAX_OUT", "3"))

TAGGER_BACKEND = os.environ.get("TAGGER_BACKEND", "classical")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "claude-haiku-4-5-20251001")

PORT = int(os.environ.get("PORT", "8000"))


def require(name: str, val: str):
    if not val:
        raise RuntimeError(
            f"{name} is not set. Add it to .env or your environment."
        )
    return val
