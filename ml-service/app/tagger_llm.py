"""Zero-shot tagger that asks Claude to pick from a fixed tag list.

Costs a fraction of a cent and a few hundred ms per call, but needs no
training data and handles weirdly-worded doubts much better than the
sklearn model.
"""
import json
from typing import List, Tuple

from . import config


# Keep in sync with the classical tagger and the doubt board's filter chips.
ALLOWED_TAGS = [
    "DSA", "Algorithms", "OOP", "DBMS", "SQL",
    "Operating Systems", "Computer Networks",
    "Web Dev", "ML", "System Design", "Theory of Computation",
    "Math", "Linear Algebra", "Calculus", "Discrete Math",
    "Physics", "Chemistry", "Biology",
    "English", "Aptitude",
]

PROMPT_TEMPLATE = """\
You are tagging a student's technical doubt for a peer-tutoring platform.

ALLOWED TAGS (use ONLY these, exact spelling):
{tags}

INSTRUCTIONS:
- Pick 1 to 3 tags that best describe the doubt.
- Use multiple tags only if multiple genuinely apply (e.g., a SQL query plan
  doubt may be both DBMS and SQL).
- "DSA" = data structures (heap, trie, linked list).
  "Algorithms" = procedures over them (sorting, DP, graph algos).
  Use both when both apply.
- "Web Dev" = browser/frontend/Node-specific. "System Design" = scalability
  and architecture.
- "Math" only if the doubt is fundamentally mathematical, not just adjacent.
- Return strict JSON only, no prose, with this exact shape:
  {{"tags": ["TagA", "TagB"]}}

DOUBT TITLE: {title}
DOUBT BODY: {body}

JSON:"""


_client = None


def _client_get():
    global _client
    if _client is not None:
        return _client
    try:
        import anthropic
    except ImportError:
        raise RuntimeError(
            "anthropic package not installed. Run: pip install anthropic"
        )
    key = config.require("ANTHROPIC_API_KEY", config.ANTHROPIC_API_KEY)
    _client = anthropic.Anthropic(api_key=key)
    return _client


def predict(title: str, body: str = "") -> Tuple[List[str], List[float], str]:
    # Matches the classical tagger signature. The LLM doesn't give us a
    # real confidence, so every returned tag gets 1.0 — UI reads that as
    # "high confidence" and shows the tags as accepted.
    client = _client_get()

    prompt = PROMPT_TEMPLATE.format(
        tags="\n".join(f"- {t}" for t in ALLOWED_TAGS),
        title=title,
        body=(body or "").strip() or "(no body provided)",
    )

    msg = client.messages.create(
        model=config.LLM_MODEL,
        max_tokens=128,
        messages=[{"role": "user", "content": prompt}],
    )

    text = "".join(b.text for b in msg.content if hasattr(b, "text")).strip()

    # Pull out the first {...} block in case the model wrapped it in prose.
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        return ([], [], f"llm:{config.LLM_MODEL}")
    try:
        data = json.loads(text[start:end + 1])
        raw_tags = data.get("tags", [])
    except json.JSONDecodeError:
        return ([], [], f"llm:{config.LLM_MODEL}")

    # Drop anything the model invented that isn't in our taxonomy.
    cleaned = [t for t in raw_tags if t in ALLOWED_TAGS][:3]
    confs = [1.0] * len(cleaned)
    return (cleaned, confs, f"llm:{config.LLM_MODEL}")
