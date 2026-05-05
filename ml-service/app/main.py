"""FastAPI app for the ML endpoints the frontend hits."""
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import tagger, duplicates, recommender
from .schemas import (
    TagDoubtRequest, TagDoubtResponse, TagPrediction,
    CheckDuplicateRequest, CheckDuplicateResponse, DuplicateMatch,
    StoreEmbeddingRequest, StoreEmbeddingResponse,
    ForYouRequest,
)


app = FastAPI(title="tuit-ml", version="0.1.0")

_origins_env = os.environ.get("FRONTEND_ORIGIN", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins_env.split(",")] if _origins_env != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    from . import config
    return {
        "status": "ok",
        "tagger_backend": config.TAGGER_BACKEND,
    }


@app.post("/tag-doubt", response_model=TagDoubtResponse)
def tag_doubt(req: TagDoubtRequest):
    tags, confs, version = tagger.predict(req.title, req.body or "")
    pairs = list(zip(tags, confs))[: max(1, req.top_k)]
    return TagDoubtResponse(
        tags=[TagPrediction(tag=t, confidence=c) for t, c in pairs],
        model_version=version,
    )


@app.post("/check-duplicate", response_model=CheckDuplicateResponse)
def check_duplicate(req: CheckDuplicateRequest):
    try:
        matches = duplicates.find_duplicates(
            req.title, req.body or "",
            threshold=req.threshold, top_k=req.top_k,
        )
    except Exception as e:
        # never block the post flow on a dupe-check failure
        print(f"[check-duplicate] failed: {e}")
        return CheckDuplicateResponse(has_duplicates=False, matches=[])

    return CheckDuplicateResponse(
        has_duplicates=bool(matches),
        matches=[DuplicateMatch(**m) for m in matches],
    )


# Fire-and-forget signal that a doubt was just posted. We don't persist
# embeddings; this just invalidates the in-memory TF-IDF index so the next
# /check-duplicate rebuilds with the new row included.
@app.post("/store-embedding", response_model=StoreEmbeddingResponse)
def store_embedding(req: StoreEmbeddingRequest):
    try:
        duplicates._state.last_refresh = 0.0
    except Exception as e:
        print(f"[store-embedding] failed to nudge refresh: {e}")
        return StoreEmbeddingResponse(ok=False)
    return StoreEmbeddingResponse(ok=True)


@app.post("/for-you")
def for_you(req: ForYouRequest):
    try:
        return recommender.for_user(req.user_id)
    except Exception as e:
        raise HTTPException(500, f"recommender failed: {e}")
