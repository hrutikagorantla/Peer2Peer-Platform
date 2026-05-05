# Find similar existing doubts.
#
# Pulls all doubts from Supabase every few minutes, builds a TF-IDF matrix
# once, and answers queries with cosine similarity. Fine for thousands of
# rows; if we ever hit 100k+ we'll want pgvector or FAISS instead.
import threading
import time
from typing import List, Optional

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from .supabase import get_db


REFRESH_INTERVAL_SEC = 300  # 5 min is plenty for now


class _State:
    vectorizer: Optional[TfidfVectorizer] = None
    matrix = None
    doubt_ids: List[str] = []
    titles:    List[str] = []
    asker_names: List[str] = []
    last_refresh: float = 0.0
    lock = threading.Lock()


_state = _State()


def _to_text(title: str, body: str) -> str:
    return f"{title}. {body or ''}"


def _refresh_index() -> int:
    db = get_db()

    res = (
        db.table("doubts")
        .select("id, title, body, asker_id")
        .order("created_at", desc=True)
        .limit(5000)
        .execute()
    )
    rows = res.data or []
    if not rows:
        with _state.lock:
            _state.vectorizer = None
            _state.matrix = None
            _state.doubt_ids = []
            _state.titles = []
            _state.asker_names = []
            _state.last_refresh = time.time()
        return 0

    asker_ids = list({r["asker_id"] for r in rows if r.get("asker_id")})
    name_map: dict[str, str] = {}
    if asker_ids:
        users = (
            db.table("users")
            .select("id, full_name")
            .in_("id", asker_ids)
            .execute()
        )
        name_map = {u["id"]: u["full_name"] for u in (users.data or [])}

    texts = [_to_text(r["title"], r.get("body") or "") for r in rows]

    vec = TfidfVectorizer(
        ngram_range=(1, 2),
        min_df=1,
        max_features=20000,
        sublinear_tf=True,
        stop_words="english",
    )
    matrix = vec.fit_transform(texts)

    with _state.lock:
        _state.vectorizer = vec
        _state.matrix = matrix
        _state.doubt_ids = [r["id"] for r in rows]
        _state.titles    = [r["title"] for r in rows]
        _state.asker_names = [name_map.get(r["asker_id"], "Student") for r in rows]
        _state.last_refresh = time.time()

    return len(rows)


def _maybe_refresh() -> None:
    if _state.vectorizer is None or (time.time() - _state.last_refresh) > REFRESH_INTERVAL_SEC:
        _refresh_index()


def find_duplicates(title: str, body: str, threshold: float = 0.78, top_k: int = 3
                    ) -> List[dict]:
    _maybe_refresh()

    if _state.vectorizer is None or _state.matrix is None or _state.matrix.shape[0] == 0:
        return []

    q_text = _to_text(title, body)
    q_vec = _state.vectorizer.transform([q_text])

    sims = (q_vec @ _state.matrix.T).toarray().ravel()
    if len(sims) == 0:
        return []

    order = np.argsort(-sims)
    out = []
    for idx in order[:top_k * 4]:
        sim = float(sims[idx])
        if sim < threshold:
            break
        out.append({
            "doubt_id":    _state.doubt_ids[idx],
            "title":       _state.titles[idx],
            "similarity":  sim,
            "asker_name":  _state.asker_names[idx],
        })
        if len(out) >= top_k:
            break
    return out


def force_refresh() -> int:
    return _refresh_index()
