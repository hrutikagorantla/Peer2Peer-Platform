#!/bin/bash
# ─────────────────────────────────────────────────────────────
# tuit — Reorganize flat repo into proper structure
# Run from inside the Peer2Peer-Platform folder:
#   chmod +x reorganize.sh && ./reorganize.sh
# ─────────────────────────────────────────────────────────────

set -e

echo "Creating folder structure..."
mkdir -p frontend
mkdir -p ml-service/app
mkdir -p ml-service/scripts
mkdir -p ml-service/data
mkdir -p ml-service/models
mkdir -p ml-service/tests
mkdir -p db

# ── 1. Frontend files ──────────────────────────────────────

echo "Moving frontend files..."
for f in index.html login.html onboarding.html booksession.html \
         allsessions.html mentorsearch.html doubts.html doubt.html \
         profile.html style.css supabase-client.js; do
  [ -f "$f" ] && mv "$f" frontend/
done

# Move assets folder if it exists at root
[ -d "assets" ] && mv assets frontend/

# Move old alldoubts.html too if it's still around
[ -f "alldoubts.html" ] && mv alldoubts.html frontend/

# ── 2. ML service files ────────────────────────────────────

echo "Moving ML service files..."

# App module (FastAPI server)
for f in main.py config.py schemas.py supabase.py \
         tagger.py tagger_classical.py tagger_llm.py tagger_model.py \
         duplicates.py recommender.py; do
  [ -f "$f" ] && mv "$f" ml-service/app/
done

# Create __init__.py if missing
touch ml-service/app/__init__.py

# Scripts (run-once tools)
for f in train_tagger.py eval_tagger.py seed_doubts.py; do
  [ -f "$f" ] && mv "$f" ml-service/scripts/
done

# Data
[ -f "doubts_dataset.jsonl" ] && mv doubts_dataset.jsonl ml-service/data/

# Models (if present)
for f in tagger_v1.joblib tagger_v1_meta.json; do
  [ -f "$f" ] && mv "$f" ml-service/models/
done

# Requirements
[ -f "requirements.txt" ] && mv requirements.txt ml-service/

# ── 3. SQL migrations ──────────────────────────────────────

echo "Moving SQL files..."
for f in supabase-setup.sql supabase-setup-v2.sql supabase-setup-v3.sql; do
  [ -f "$f" ] && mv "$f" db/
done

# ── 4. Clean up artifacts ──────────────────────────────────

echo "Cleaning up..."
# Remove the weird mnt/ folder from Claude's download artifact
[ -d "mnt" ] && rm -rf mnt

# Remove any leftover __pycache__
find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

# ── 5. Create .gitignore if missing ────────────────────────

if [ ! -f ".gitignore" ]; then
echo "Creating .gitignore..."
cat > .gitignore << 'GITIGNORE'
# Python
**/__pycache__/
**/.venv/
**/*.pyc

# Environment
**/.env
.env

# ML artifacts (too large for git)
ml-service/models/*.joblib
ml-service/models/*.bin
ml-service/data/train.jsonl
ml-service/data/val.jsonl
ml-service/data/test.jsonl

# OS
.DS_Store
Thumbs.db

# Node
node_modules/
GITIGNORE
fi

# ── 6. Verify ──────────────────────────────────────────────

echo ""
echo "Done! Final structure:"
echo ""

# Print tree-like output without requiring 'tree' command
echo "Peer2Peer-Platform/"
for dir in frontend ml-service/app ml-service/scripts ml-service/data ml-service/models db backend; do
  if [ -d "$dir" ]; then
    echo "├── $dir/"
    ls "$dir" 2>/dev/null | while read f; do echo "│   ├── $f"; done
  fi
done

echo ""
echo "Loose files still in root (should only be README, CHECKLIST, .gitignore, this script):"
ls -1 *.* 2>/dev/null || echo "  (none)"
