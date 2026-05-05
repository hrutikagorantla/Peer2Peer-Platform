# tuit — Peer-to-peer Tutoring Platform

Frontend (HTML/CSS/JS + Supabase) + ML service (FastAPI) for a peer-to-peer tutoring app. Light-cream design, full booking flow, doubt board with AI-suggested tags + duplicate detection, profile with tier system, and a personalized "For You" dashboard section.

## Repo layout

```
tuit/
├── *.html / style.css / supabase-client.js   ← frontend
├── supabase-setup*.sql                       ← schema migrations
├── ml-service/                               ← Python ML/NLP service
│   ├── app/                                  ← FastAPI server
│   ├── scripts/                              ← train, eval, seed
│   ├── data/                                 ← 479-doubt training set
│   └── models/                               ← trained tagger (.joblib)
└── README.md                                 ← this file
```

## What's live in your Supabase right now

- **6 demo mentors** (Rahul, Arjun, Amrutha, Priya, Karan, Ishaan) with bios, subjects, ratings, points
- **270 open sessions** (210 1:1 + 60 group) across the next 7 days
- **111 sample doubts** with realistic tags, upvote counts, and timestamps
- Auth trigger creates `public.users` rows on signup automatically
- Row-level security policies set on all tables
- Realtime publication on `bookings`

## Running locally

### 1. Start the frontend

⚠️ Don't open files with `file://`. Use a local server:

```bash
cd /path/to/tuit
python3 -m http.server 5500
# Open http://localhost:5500/login.html
```

Or VS Code Live Server: right-click `login.html` → "Open with Live Server".

### 2. Start the ML service (optional, for AI tagging + duplicate detection)

```bash
cd ml-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (get from Supabase dashboard → API)
uvicorn app.main:app --reload --port 8000
```

The frontend defaults to `http://localhost:8000` for the ML service. If it's not running, the doubt board still works — AI suggestions just don't appear.

### 3. Frontend → ML service URL config (when deployed)

Before loading `supabase-client.js` in production:

```html
<script>window.TUIT_ML_URL = 'https://ml.tuit.app';</script>
<script src="supabase-client.js"></script>
```

## ML service endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness check |
| POST | `/tag-doubt` | Predict tags for a new doubt |
| POST | `/check-duplicate` | Find similar existing doubts |
| POST | `/store-embedding` | Notify service of new doubt (rebuilds index) |
| POST | `/for-you` | Personalized dashboard tiles |

### `/tag-doubt`

```json
// request
{ "title": "Why does my SQL JOIN return duplicates?", "body": "...", "top_k": 3 }

// response
{ "tags": [{"tag": "SQL", "confidence": 0.65}], "model_version": "classical:v1" }
```

### `/check-duplicate`

```json
// request
{ "title": "What is the difference between WHERE and HAVING", "body": "...", "threshold": 0.40, "top_k": 3 }

// response
{
  "has_duplicates": true,
  "matches": [
    {"doubt_id": "abc-123", "title": "Difference between WHERE and HAVING with GROUP BY", "similarity": 0.82, "asker_name": "Karan K."}
  ]
}
```

## Tagger backends

Three options, switchable via `TAGGER_BACKEND` env var:

| Backend | When to use | Cost | Latency | Accuracy |
|---|---|---|---|---|
| `classical` (default) | Free baseline | $0 | ~5ms | macro-F1 0.59 with 479 examples |
| `llm` | More accurate, less data needed | ~$0.001/call | 200-800ms | High; uses Anthropic Claude Haiku |
| `ensemble` | Try LLM first, fall back to classical | varies | varies | Best of both |

Switch via `.env`:
```
TAGGER_BACKEND=classical
# or
TAGGER_BACKEND=llm
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL=claude-haiku-4-5-20251001
```

## Retraining the classical tagger

The shipped model was trained on `data/doubts_dataset.jsonl` (479 examples). To retrain after adding new examples:

```bash
cd ml-service
python scripts/train_tagger.py
# saves models/tagger_v1.joblib + meta.json
python scripts/eval_tagger.py    # check held-out test scores
```

## Per-tag model performance (current shipped model)

| Tag | F1 | Notes |
|---|---|---|
| ML | 0.96 | Strong |
| DBMS | 0.92 | Strong |
| DSA | 0.80 | Good |
| Web Dev | 0.71 | Good |
| Algorithms | 0.53 | Confused with DSA — overlaps |
| Math | 0.35 | Often a secondary tag |
| SQL | 0.44 | Under-represented in training |
| System Design | 0.00 | Only 4 in test set; needs more data |

To improve: generate more SQL + System Design examples, or switch to `TAGGER_BACKEND=llm`.

## What's still missing for production

1. **Tighten RLS** — `sessions_student_update_count` is fully permissive for the booking flow. Replace with a Postgres function that does the increment atomically.
2. **Email confirmation ON** before public launch (currently OFF for dev convenience).
3. **Site URL & redirect URLs** in Supabase Auth → currently set for localhost.
4. **CORS on ML service** — `app/main.py` defaults to `*`. Set `FRONTEND_ORIGIN` to your domain.
5. **Service role key hygiene** — only in `.env`, never committed. `.gitignore` is set up.
6. **Hosting** — Frontend on Netlify/Vercel/Cloudflare Pages, ML service on Railway/Render/Fly.
7. **Realtime on doubts table** — currently only `bookings` has realtime. Add `doubts` + `doubt_answers` so the doubt board updates live.
8. **Mobile responsive pass** — works to ~700px, hasn't been tested on real devices.
9. **Error tracking** — add Sentry to both frontend + ML service.
10. **CI** — `pytest` for ml-service, lint for frontend.

## Common issues

**"Could not load doubts"** → Run the v3 SQL script (or check that `doubts` table exists with `tags`/`upvotes`/etc columns).

**Booking page shows "No mentors"** → The seed script in `supabase-setup-v3.sql` (or the equivalent migrations applied via MCP) inserts demo mentors. Check `SELECT count(*) FROM users WHERE role='mentor'`.

**Sidebar still dark** → Hard-refresh (CSS may be cached).

**ML tags not appearing** → ML service isn't running, or CORS is blocking. Check browser console for errors.

**Tags appear but say "100%"** → You're on the LLM backend, which doesn't return real probabilities. This is expected.
