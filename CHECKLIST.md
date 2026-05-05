# tuit — Pre-launch checklist

A working list of everything between "demo on localhost" and "shipped to public users." Items are ordered by **risk to launch**, not effort.

## P0 — Will break or harm users if not fixed before launch

### Per-user vote tracking
**Status: missing**
Right now anyone can spam the upvote button on doubts and answers — there's no `votes` table tracking who voted. A motivated user could juice their friend's answer to "best." Add:

```sql
CREATE TABLE doubt_votes (
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  doubt_id   uuid REFERENCES doubts(id) ON DELETE CASCADE,
  value      smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, doubt_id)
);
CREATE TABLE answer_votes (
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  answer_id  uuid REFERENCES doubt_answers(id) ON DELETE CASCADE,
  value      smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, answer_id)
);
```
Then change `voteAnswer` / `voteDoubt` in `doubt.html` to UPSERT into these tables, and have a trigger recompute `upvotes` from the sum.

### Tighten the `sessions_student_update_count` RLS policy
**Status: too permissive**
Currently any authenticated user can update any session row. Replace with a Postgres function that does the booking atomically:

```sql
CREATE OR REPLACE FUNCTION book_session(p_session uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE booking_id uuid;
BEGIN
  -- Lock the row, check availability
  PERFORM 1 FROM sessions
   WHERE id = p_session
     AND status = 'available'
     AND current_bookings < max_students
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unavailable'; END IF;

  INSERT INTO bookings (session_id, student_id, status, payment_status, payment_amount)
    SELECT p_session, auth.uid(), 'confirmed', 'unpaid', price FROM sessions WHERE id = p_session
    RETURNING id INTO booking_id;
  UPDATE sessions
     SET current_bookings = current_bookings + 1,
         status = CASE WHEN current_bookings + 1 >= max_students THEN 'full' ELSE 'available' END
   WHERE id = p_session;

  RETURN booking_id;
END $$;
```

Then in the frontend replace the manual freshness-check + insert with `db.rpc('book_session', { p_session: id })`. After that, drop the permissive UPDATE policy and replace with a strict one (mentor-only).

### Email confirmation: turn ON
Currently OFF for dev convenience. In Supabase Dashboard → Authentication → Settings, flip "Confirm email" back on before launch.

### Site URL & Redirect URLs in Supabase Auth
Update these to your production frontend URL. Currently set to `http://localhost:5500` or similar.

### CORS lockdown on ML service
`app/main.py` currently allows `*` origins. Set `FRONTEND_ORIGIN=https://your-domain.com` in the `.env` so it only accepts requests from your frontend.

### Service role key hygiene
Verify that:
- `.env` is in `.gitignore` (it is — checked)
- The `SUPABASE_SERVICE_ROLE_KEY` only exists in the ML service environment, never in any HTML/JS file
- Frontend uses the **publishable** key (`sb_publishable_...`), which is in `supabase-client.js` — that's correct, publishable keys are designed to be public

### Rate limiting on ML endpoints
Right now anyone can hammer `/tag-doubt` with the LLM backend, costing you money. Add rate limiting middleware:

```python
# pip install slowapi
from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/tag-doubt")
@limiter.limit("30/minute")  # adjust to your traffic
def tag_doubt(...): ...
```

## P1 — Functional gaps users will notice

### Pagination on doubts and sessions
The doubt board fetches all 111 doubts in one query. Fine now, breaks at scale. Add Supabase `range()` calls + a "Load more" button.

### Realtime on doubts table
Realtime is currently only on `bookings`. To make the doubt board live-update when answers come in, run:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.doubt_answers;
```
Then add a subscription in `doubt.html`:
```js
db.channel('answers').on('postgres_changes',
  { event: 'INSERT', schema: 'public', table: 'doubt_answers', filter: `doubt_id=eq.${doubtId}` },
  () => loadThread()
).subscribe();
```

### Mentor approval flow
Right now anyone signing up as "mentor" goes straight to the mentor dashboard. For real launch you probably want admin approval before they appear in `mentorsearch`. Add an `is_approved` column (default false), filter `mentorsearch` by `is_approved = true`, and build a tiny admin page.

### Profile editing for required fields
Make sure mentors fill in `bio`, `subjects`, and `hourly_rate` before they're listed. Currently they could sign up and have no rate, which the booking flow handles gracefully (shows "Free") but isn't intentional.

### Soft delete instead of hard delete
`ON DELETE CASCADE` currently nukes all bookings if a session is deleted. Better to set `status = 'cancelled'` and notify booked students.

### Auth-required pages handle expired sessions
Some pages call `requireAuth()` and redirect to login. Verify token refresh works when a tab has been open for 1+ hour.

### Mobile responsive pass
All pages have media queries down to ~700px but I haven't tested on real devices. Likely problem areas:
- `doubt.html` answer-card vote column may crowd
- `profile.html` banner avatar overlap
- Doubts page 3-column layout collapses to 1; verify it's readable

## P2 — Nice-to-haves and observability

### Error tracking
Add Sentry on both frontend (catches uncaught errors, RLS failures) and ML service (catches API errors, training crashes). 5-minute setup, prevents most silent failures.

### Analytics
Even basic Plausible / Umami so you know which pages people use. PostHog if you want event tracking later.

### CI
GitHub Actions:
```yaml
# .github/workflows/test.yml
on: [push, pull_request]
jobs:
  ml-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: cd ml-service && pip install -r requirements.txt && pytest tests/
```

### Frontend smoke test
A single Playwright script that signs up, books a session, asks a doubt. Catches 80% of regressions for 20% of effort.

### Database backups
Supabase free tier has 7-day point-in-time recovery on Pro. On free tier, schedule a nightly `pg_dump` to S3.

### Logging
ML service should log every `/tag-doubt` and `/check-duplicate` call with input+output+latency. You'll need this to debug "why did the model tag this wrong?"

## P3 — Future improvements

### Replace heuristic For You with a learned ranker
Once you have ~1000 user-mentor interactions, train a simple matrix factorization or content-based ranker. The `/for-you` endpoint signature stays the same — only the implementation changes.

### Better tag taxonomy management
Right now tags are free text. As your user base grows, build a small admin tool to merge synonyms ("ML" / "Machine Learning" / "machine-learning") and prune dead tags.

### Notifications
- Email when a new booking comes in (mentor)
- Email when your doubt gets answered (asker)
- Email when your answer is marked best (answerer)
Use Supabase Edge Functions + Resend or Postmark.

### Payments
Currently `payment_status` is hardcoded `'unpaid'`. Razorpay or Stripe integration when you go from MVP to real money.

### Search
Doubt board search is client-side only. Once you have 10k+ doubts, move to Postgres full-text search:
```sql
ALTER TABLE doubts ADD COLUMN tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || coalesce(body,''))) STORED;
CREATE INDEX doubts_tsv_idx ON doubts USING gin(tsv);
```

### Internationalization
Hardcoded English strings everywhere. If you want to expand beyond English-speaking users, factor strings out into a JSON file per locale.

## Hosting recipe (concrete)

### Frontend → Cloudflare Pages (free)
```bash
npm i -g wrangler
cd /path/to/tuit
wrangler pages deploy . --project-name=tuit
```
Or GitHub-connect: push to a `main` branch, configure build = none, output dir = `.`. Done in 5 minutes.

### ML service → Railway (free tier with $5 credit)
1. Push `ml-service/` to a GitHub repo
2. railway.app → New Project → Deploy from GitHub
3. Add env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` (if using LLM backend), `FRONTEND_ORIGIN`
4. Railway auto-detects Python, runs `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Copy the public URL Railway gives you and put it in your frontend:
   ```html
   <!-- In every HTML page, before supabase-client.js -->
   <script>window.TUIT_ML_URL = 'https://tuit-ml.up.railway.app';</script>
   ```

### Database → Already on Supabase
Free tier is fine for launch. Upgrade to Pro ($25/mo) when you need PITR backups + more storage.

## Test before launch

Sign up flow:
- [ ] New student signup → onboarding → dashboard shows their subjects
- [ ] New mentor signup → straight to mentor dashboard
- [ ] Sign in with `rahul.sharma@demo.tuit` / `mentor1234` → mentor dashboard works
- [ ] Sign out → forwards to login

Booking flow:
- [ ] Student picks mentor → 1:1 → time slot → confirm → success page
- [ ] Mentor sees the booking appear in their dashboard (realtime works)
- [ ] Try to book the same slot twice → second attempt shows "already booked"
- [ ] Try to book a slot at max capacity → shows "No longer available"

Doubt flow:
- [ ] Open Doubts page → 8 doubts have answers, 103 are open
- [ ] Click a doubt with answers → thread page renders with best answer highlighted
- [ ] Type an answer → Post → appears at top
- [ ] Asker can mark another's answer as best → +50 points
- [ ] Tag list left-rail shows your subjects with a small dot
- [ ] Click a tag → list filters

ML service:
- [ ] `curl localhost:8000/health` → `{"status":"ok"}`
- [ ] Open Ask a doubt modal → type "Why does my SQL JOIN return duplicates?" → AI tags fire after 600ms
- [ ] Type something close to an existing doubt → duplicate warning panel appears
- [ ] Stop the ML service → frontend still works, AI panel just doesn't show

Mobile:
- [ ] Resize to 375px width → sidebar collapses → all pages readable
