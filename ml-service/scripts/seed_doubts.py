# Bulk-insert doubts from a JSONL into Supabase, attaching each one to
# a random existing student as the asker.
#
#   python scripts/seed_doubts.py
#   python scripts/seed_doubts.py path/to/file.jsonl
#
# Needs at least one row in users where role='student' — the doubt cards
# show the asker's name and we can't fake that without a real user row.
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.supabase import db


ROOT = Path(__file__).parent.parent


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "doubts_dataset.jsonl"
    if not path.exists():
        print(f"ERROR: {path} not found")
        sys.exit(1)

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
