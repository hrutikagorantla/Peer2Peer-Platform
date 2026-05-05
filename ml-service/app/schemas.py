# Pydantic request/response shapes. Mirrors what the frontend sends/expects.
from typing import List, Optional
from pydantic import BaseModel, Field


class TagDoubtRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    body: Optional[str] = ""
    top_k: int = 3


class TagPrediction(BaseModel):
    tag: str
    confidence: float


class TagDoubtResponse(BaseModel):
    tags: List[TagPrediction]
    model_version: str


class CheckDuplicateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    body: Optional[str] = ""
    threshold: float = 0.78
    top_k: int = 3


class DuplicateMatch(BaseModel):
    doubt_id: str
    title: str
    similarity: float
    asker_name: str


class CheckDuplicateResponse(BaseModel):
    has_duplicates: bool
    matches: List[DuplicateMatch]


class StoreEmbeddingRequest(BaseModel):
    doubt_id: str
    title: str
    body: Optional[str] = ""
    predicted_tags: List[str] = []
    confidence: float = 0.0


class StoreEmbeddingResponse(BaseModel):
    ok: bool


class ForYouRequest(BaseModel):
    user_id: str


class ContinueTile(BaseModel):
    title: str
    sub: str
    href: str


class TopicTile(BaseModel):
    topic: str
    mentor_count: int
    doubt_count: int


class MentorTile(BaseModel):
    mentor_id: str
    full_name: str
    rating: Optional[float] = None
    hourly_rate: Optional[float] = None
    bio: Optional[str] = None


class ForYouResponse(BaseModel):
    continue_: Optional[ContinueTile] = Field(None, alias="continue")
    topic: Optional[TopicTile] = None
    mentor: Optional[MentorTile] = None
