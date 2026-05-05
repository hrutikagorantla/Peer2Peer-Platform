# Heuristic "For You" tiles. No ML here yet — just a few queries against
# the user's last booking, their declared subjects, and the doubt board.
from typing import Optional

from .supabase import get_db


def for_user(user_id: str) -> dict:
    db = get_db()
    user_row = (
        db.table("users").select("*").eq("id", user_id).maybe_single().execute()
    )
    user = user_row.data if user_row else None
    if not user:
        return {"continue": None, "topic": None, "mentor": None}

    return {
        "continue": _continue_tile(user_id),
        "topic":    _topic_tile(user),
        "mentor":   _mentor_tile(user),
    }


def _continue_tile(user_id: str) -> Optional[dict]:
    db = get_db()
    last = (
        db.table("bookings")
        .select("notes, sessions(title, subject)")
        .eq("student_id", user_id)
        .order("booked_at", desc=True)
        .limit(1)
        .execute()
    )
    if not last.data:
        return None
    sess = last.data[0].get("sessions") or {}
    return {
        "title": sess.get("title", "Continue learning"),
        "sub":   "Picked up from your last session",
        "href":  "booksession.html",
    }


def _topic_tile(user: dict) -> Optional[dict]:
    db = get_db()
    subjects = user.get("subjects") or []

    doubts = db.table("doubts").select("tags").limit(200).execute()
    tag_counts: dict = {}
    for d in doubts.data or []:
        for t in (d.get("tags") or []):
            tag_counts[t] = tag_counts.get(t, 0) + 1

    candidate = None
    for s in subjects:
        if s in tag_counts:
            candidate = s
            break
    if not candidate and tag_counts:
        candidate = max(tag_counts, key=tag_counts.get)
    if not candidate:
        return None

    mentors = (
        db.table("users")
        .select("id", count="exact")
        .eq("role", "mentor").eq("is_active", True)
        .contains("subjects", [candidate])
        .execute()
    )
    return {
        "topic": candidate,
        "mentor_count": mentors.count or 0,
        "doubt_count":  tag_counts.get(candidate, 0),
    }


def _mentor_tile(user: dict) -> Optional[dict]:
    db = get_db()
    subjects = user.get("subjects") or []
    q = (
        db.table("users")
        .select("id, full_name, rating, hourly_rate, subjects, bio")
        .eq("role", "mentor").eq("is_active", True)
    )
    if subjects:
        q = q.contains("subjects", [subjects[0]])
    res = q.order("rating", desc=True).limit(1).execute()
    if not res.data:
        return None
    m = res.data[0]
    return {
        "mentor_id":   m["id"],
        "full_name":   m["full_name"],
        "rating":      m.get("rating"),
        "hourly_rate": m.get("hourly_rate"),
        "bio":         m.get("bio"),
    }
