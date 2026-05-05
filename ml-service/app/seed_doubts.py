"""Bulk-insert the doubts JSONL into Supabase.

Usage:
    python scripts/seed_doubts.py          # use default dataset
    python scripts/seed_doubts.py path.jsonl

Reads doubts from JSONL, picks a random asker_id from existing students,
inserts each row.

Run this AFTER you have at least one student user in the DB. The frontend
needs the asker_id to render the doubt card with the asker's name.
"""
import json
import random
import sys
from pathlib import Path

# Make 'app' importable when running as a script
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.supabase import get_db


ROOT = Path(__file__).parent.parent


def main():
    db = get_db()
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "doubts_dataset.jsonl"
    if not path.exists():
        print(f"ERROR: {path} not found")
        sys.exit(1)

    # Find some students to act as askers
    students = db.table("users").select("id").eq("role", "student").execute()
    if not students.data:
        print("ERROR: no students in users table. Sign up at least one.")
        sys.exit(1)
    asker_ids = [u["id"] for u in students.data]
    print(f"Using {len(asker_ids)} student(s) as askers.")

    rnd = random.Random(7)
    rows = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            rows.append({
                "asker_id": rnd.choice(asker_ids),
                "title":    d["title"],
                "body":     d.get("body", ""),
                "tags":     d.get("tags", []),
                "upvotes":  rnd.randint(0, 80),
                "answer_count": rnd.randint(0, 5),
                "views":    rnd.randint(10, 200),
                "status":   "open",
            })

    # Insert in chunks of 50
    chunk = 50
    inserted = 0
    for i in range(0, len(rows), chunk):
        batch = rows[i:i + chunk]
        res = db.table("doubts").insert(batch).execute()
        inserted += len(res.data or [])
        print(f"  + {inserted}/{len(rows)}")

    print(f"\nInserted {inserted} doubts.")


if __name__ == "__main__":
    main()
