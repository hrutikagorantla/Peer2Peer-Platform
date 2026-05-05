# Train the doubt tagger from data/doubts_dataset.jsonl.
#
#   python scripts/train_tagger.py
#
# Reads JSONL ({"title","body","tags"}), splits 80/10/10, runs TF-IDF
# 1-2gram into OneVsRest LogReg, prints val + test macro-F1, then dumps
# the model and a meta sidecar to models/.
#
# We're sitting at ~111 labeled examples; sentence-transformers don't
# really beat plain TF-IDF until you have a few thousand.
import json
import random
import sys
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.multiclass import OneVsRestClassifier
from sklearn.preprocessing import MultiLabelBinarizer
from sklearn.metrics import f1_score, classification_report
from sklearn.pipeline import Pipeline


sys.path.insert(0, str(Path(__file__).parent.parent))
from app.tagger_model import TaggerWrapper


ROOT = Path(__file__).parent.parent
DATA = ROOT / "data" / "doubts_dataset.jsonl"
MODEL_DIR = ROOT / "models"
MODEL_DIR.mkdir(exist_ok=True)

VERSION = "v1"
RNG = 42


def load() -> list[dict]:
    rows = []
    with open(DATA) as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def split(rows: list[dict], train_frac=0.80, val_frac=0.10):
    rnd = random.Random(RNG)
    rnd.shuffle(rows)
    n = len(rows)
    n_tr = int(n * train_frac)
    n_va = int(n * val_frac)
    return rows[:n_tr], rows[n_tr:n_tr + n_va], rows[n_tr + n_va:]


def to_text(r: dict) -> str:
    return f"{r['title']}. {r.get('body','')}"


def main():
    rows = load()
    print(f"Loaded {len(rows)} examples from {DATA}")

    train, val, test = split(rows)
    print(f"Train/val/test = {len(train)}/{len(val)}/{len(test)}")

    for name, part in [("train", train), ("val", val), ("test", test)]:
        out = ROOT / "data" / f"{name}.jsonl"
        with open(out, "w") as f:
            for r in part:
                f.write(json.dumps(r) + "\n")

    X_tr = [to_text(r) for r in train]
    y_tr = [r["tags"] for r in train]
    X_va = [to_text(r) for r in val]
    y_va = [r["tags"] for r in val]
    X_te = [to_text(r) for r in test]
    y_te = [r["tags"] for r in test]

    mlb = MultiLabelBinarizer()
    Y_tr = mlb.fit_transform(y_tr)
    Y_va = mlb.transform(y_va)
    Y_te = mlb.transform(y_te)

    pipe = Pipeline([
        ("tfidf", TfidfVectorizer(
            ngram_range=(1, 2),
            min_df=1,
            max_features=8000,
            sublinear_tf=True,
            stop_words="english",
        )),
        ("clf", OneVsRestClassifier(
            LogisticRegression(C=4.0, max_iter=1000, class_weight="balanced"),
            n_jobs=-1,
        )),
    ])

    pipe.fit(X_tr, Y_tr)

    Y_va_hat = pipe.predict(X_va)
    Y_te_hat = pipe.predict(X_te)
    f1_va = f1_score(Y_va, Y_va_hat, average="macro", zero_division=0)
    f1_te = f1_score(Y_te, Y_te_hat, average="macro", zero_division=0)
    print(f"\nVal macro-F1: {f1_va:.3f}")
    print(f"Test macro-F1: {f1_te:.3f}")
    print("\nPer-tag report (test):")
    print(classification_report(Y_te, Y_te_hat, target_names=mlb.classes_, zero_division=0))

    wrap = TaggerWrapper(pipe, list(mlb.classes_))
    out_path = MODEL_DIR / f"tagger_{VERSION}.joblib"
    joblib.dump(wrap, out_path)
    print(f"\nSaved model → {out_path}")

    meta = {
        "version": VERSION,
        "trained_at": datetime.utcnow().isoformat(),
        "n_train": len(train),
        "n_val": len(val),
        "n_test": len(test),
        "tags": list(mlb.classes_),
        "val_macro_f1": float(f1_va),
        "test_macro_f1": float(f1_te),
    }
    meta_path = MODEL_DIR / f"tagger_{VERSION}_meta.json"
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"Saved meta → {meta_path}")


if __name__ == "__main__":
    main()
