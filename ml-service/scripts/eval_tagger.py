# Run the saved tagger over data/test.jsonl and print exact / partial /
# miss counts. Handy after retraining to sanity-check vs the previous run.
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.tagger import predict, _load
from app import tagger as tagger_mod

ROOT = Path(__file__).parent.parent
TEST = ROOT / "data" / "test.jsonl"


def main():
    if not TEST.exists():
        print(f"No test split at {TEST}. Run train_tagger.py first.")
        sys.exit(1)

    _load()
    if tagger_mod._model is None:
        print("No model loaded. Run train_tagger.py first.")
        sys.exit(1)

    rows = [json.loads(l) for l in TEST.read_text().splitlines() if l.strip()]
    correct = 0
    partial = 0
    misses = []

    for r in rows:
        gold = set(r["tags"])
        pred_tags, _, _ = predict(r["title"], r.get("body", ""))
        pred = set(pred_tags)
        if gold == pred:
            correct += 1
        elif gold & pred:
            partial += 1
        else:
            misses.append((r["title"], list(gold), pred_tags))

    n = len(rows)
    print(f"Exact match: {correct}/{n}  ({100*correct/n:.0f}%)")
    print(f"Partial:     {partial}/{n}  ({100*partial/n:.0f}%)")
    print(f"Misses:      {len(misses)}/{n}")

    if misses:
        print("\nFirst 10 misses:")
        for title, gold, pred in misses[:10]:
            print(f"  Gold: {gold}")
            print(f"  Pred: {pred}")
            print(f"    {title[:80]}")
            print()


if __name__ == "__main__":
    main()
