# Thin dispatch layer in front of the actual taggers.
# TAGGER_BACKEND picks one of: classical (sklearn), llm (Anthropic),
# or ensemble (try llm first, fall back to classical on failure / empty).
from typing import List, Tuple

from . import config


def predict(title: str, body: str = "") -> Tuple[List[str], List[float], str]:
    backend = config.TAGGER_BACKEND.lower()

    if backend == "llm":
        from . import tagger_llm
        return tagger_llm.predict(title, body)

    if backend == "ensemble":
        from . import tagger_classical, tagger_llm
        try:
            tags, confs, ver = tagger_llm.predict(title, body)
            if tags:
                return (tags, confs, f"ensemble({ver})")
        except Exception as e:
            print(f"[tagger] LLM backend failed, falling back to classical: {e}")
        return tagger_classical.predict(title, body)

    from . import tagger_classical
    return tagger_classical.predict(title, body)
