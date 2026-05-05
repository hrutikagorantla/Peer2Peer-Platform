# TUIT

A peer-to-peer tutoring platform that connects college students with verified peer mentors for focused, on-demand learning sessions. Built as a four-person student project with a working booking flow, real-time updates, and an onboarding-first auth experience.

## What it does

Students sign up, complete a four-step onboarding to share their subjects, goals, and study patterns, then book one-on-one or group sessions with peer mentors. Mentors manage their availability, broadcast announcements, and see new bookings appear in real time on their dashboard. The platform is built around a 30-second booking flow — pick a mentor, pick a slot, book.

## Tech stack

- **Frontend** — Plain HTML, CSS, and vanilla JavaScript with a unified design system (Fraunces serif + DM Sans, warm cream palette, rounded cards)
- **Backend** — Node.js / Express
- **Database** — Supabase (PostgreSQL)
- **Auth** — Supabase Auth with row-level security policies
- **Realtime** — Supabase channel subscriptions for live booking updates
- **Future** — React Native mobile app, ML-powered mentor recommendations

## Pages

- `login.html` — Two-panel sign-in / sign-up with role selection (student or mentor)
- `onboarding.html` — Four-step profile setup for new students (subjects, ranks, weaknesses, goals)
- `index.html` — Dashboard, role-aware (different views for students and mentors)
- `booksession.html` — Single-card booking flow with mentor grid, session type, time slots, and topic
- `allsessions.html` — Session list with mentor management for hosts
- `mentorsearch.html` — Browse and filter mentors by subject, rating, and price

## Local setup

1. Clone the repo with `git clone https://github.com/okayayushhh/Peer2Peer-Platform.git`
2. Open the project in VS Code
3. Install the **Live Server** extension and right-click `frontend/login.html` then "Open with Live Server". The Supabase client requires `http://` and breaks when files are opened directly via `file://` because auth sessions don't persist across pages.
4. The Supabase project is already wired up in `frontend/supabase-client.js` — no environment variables needed for the frontend.

## Project structure

    Peer2Peer-Platform/
    ├── frontend/         # All HTML pages, shared client, styles
    ├── backend/          # Node.js / Express server
    ├── db/               # SQL migrations and seed scripts
    ├── ml-service/       # Future ML recommendation service
    ├── README.md
    └── CHECKLIST.md

## Database

The Supabase schema centers on five tables: `users` (with role, profile, and onboarding fields), `sessions` (mentor availability and slots), `bookings` (student-to-session links), `doubts`, and `broadcasts`. Row-level security policies ensure users can only update their own profile and bookings.

If sessions go stale (start dates in the past), run `db/seed-refresh.sql` to shift all session times forward and reset booking counts.


## Status

Currently in active development. Core booking flow is functional end-to-end. Onboarding gates new signups before dashboard access. Realtime mentor dashboard is live. Next up: payment integration and ML-powered mentor matching.
