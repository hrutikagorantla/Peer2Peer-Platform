# sklearn TF-IDF + LogReg tagger. Multi-label: returns every class above
# TAG_THRESHOLD, capped at TAG_MAX_OUT, sorted by confidence. If nothing
# crosses the threshold we still hand back the single best tag so the UI
# never has to deal with an empty list.
import json
from typing import List, Tuple, Optional
import joblib

from .config import MODEL_DIR, TAGGER_MODEL, TAG_THRESHOLD, TAG_MAX_OUT
from . import tagger_model  # noqa: F401  needed so joblib can resolve TaggerWrapper


_model = None
_meta = None


def _load():
    global _model, _meta
    if _model is not None:
        return
    model_path = MODEL_DIR / TAGGER_MODEL
    meta_path = MODEL_DIR / TAGGER_MODEL.replace(".joblib", "_meta.json")
    if not model_path.exists():
        print(f"[tagger_classical] WARN: {model_path} not found.")
        return
    _model = joblib.load(model_path)
    if meta_path.exists():
        _meta = json.loads(meta_path.read_text())


def predict(title: str, body: str = "", threshold: Optional[float] = None
            ) -> Tuple[List[str], List[float], str]:
    _load()
    if _model is None:
        return ([], [], "none")

    text = f"{title}. {body or ''}"
    thr = threshold if threshold is not None else TAG_THRESHOLD

    probs = _model.predict_proba([text])[0]
    classes = _model.classes_

    pairs = sorted(zip(classes, probs), key=lambda p: -p[1])
    pairs = [(t, float(p)) for t, p in pairs if p >= thr]
    pairs = pairs[:TAG_MAX_OUT]

    if not pairs and len(probs) > 0:
        import numpy as np
        best_idx = int(np.argmax(probs))
        pairs = [(classes[best_idx], float(probs[best_idx]))]

    tags = [t for t, _ in pairs]
    confs = [c for _, c in pairs]
    version = (_meta or {}).get("version", "v1")
    return (tags, confs, f"classical:{version}")
