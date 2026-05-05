-- v2 migration: points/avatar on users, doubts + doubt_answers tables,
-- and seed mentors/sessions/doubts so the dashboard isn't empty.
-- Run after supabase-setup.sql. Idempotent.

-- extend users with points + avatar
alter table public.users add column if not exists points int not null default 0;
alter table public.users add column if not exists avatar_url text;

-- doubts board
create table if not exists public.doubts (
  id            uuid primary key default gen_random_uuid(),
  asker_id      uuid not null references public.users(id) on delete cascade,
  title         text not null,
  body          text,
  tags          text[] default '{}',
  upvotes       int not null default 0,
  answer_count  int not null default 0,
  views         int not null default 0,
  status        text not null default 'open' check (status in ('open','answered','closed')),
  created_at    timestamptz not null default now()
);
create index if not exists doubts_created_idx on public.doubts(created_at desc);
create index if not exists doubts_tags_idx    on public.doubts using gin(tags);
create index if not exists doubts_asker_idx   on public.doubts(asker_id);

-- answers under each doubt
create table if not exists public.doubt_answers (
  id           uuid primary key default gen_random_uuid(),
  doubt_id     uuid not null references public.doubts(id) on delete cascade,
  answerer_id  uuid not null references public.users(id) on delete cascade,
  body         text not null,
  upvotes      int not null default 0,
  is_best      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists answers_doubt_idx    on public.doubt_answers(doubt_id);
create index if not exists answers_answerer_idx on public.doubt_answers(answerer_id);

-- keep doubts.answer_count in sync as answers come and go
create or replace function public.bump_answer_count()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    update public.doubts set answer_count = answer_count + 1, status = 'answered'
    where id = new.doubt_id;
  elsif (tg_op = 'DELETE') then
    update public.doubts set answer_count = greatest(0, answer_count - 1)
    where id = old.doubt_id;
  end if;
  return null;
end; $$;
drop trigger if exists doubt_answer_count on public.doubt_answers;
create trigger doubt_answer_count
  after insert or delete on public.doubt_answers
  for each row execute function public.bump_answer_count();

-- best-answer reward: +50 pts to the answerer
create or replace function public.award_best_answer()
returns trigger language plpgsql security definer as $$
begin
  if (new.is_best = true and (old.is_best is null or old.is_best = false)) then
    update public.users set points = points + 50 where id = new.answerer_id;
  end if;
  return new;
end; $$;
drop trigger if exists best_answer_trigger on public.doubt_answers;
create trigger best_answer_trigger
  after update on public.doubt_answers
  for each row execute function public.award_best_answer();

-- RLS for the new tables
alter table public.doubts        enable row level security;
alter table public.doubt_answers enable row level security;

drop policy if exists "doubts_read_all"     on public.doubts;
drop policy if exists "doubts_write_own"    on public.doubts;
drop policy if exists "doubts_update_own"   on public.doubts;
drop policy if exists "doubts_update_views" on public.doubts;

create policy "doubts_read_all"   on public.doubts for select using (true);
create policy "doubts_write_own"  on public.doubts for insert with check (auth.uid() = asker_id);
create policy "doubts_update_own" on public.doubts for update using (auth.uid() = asker_id);
-- views/upvotes/answer_count get updated by anyone reading the doubt; loose policy is fine here
create policy "doubts_update_views" on public.doubts for update using (true) with check (true);

drop policy if exists "answers_read_all"   on public.doubt_answers;
drop policy if exists "answers_write_own"  on public.doubt_answers;
drop policy if exists "answers_update_own" on public.doubt_answers;

create policy "answers_read_all"   on public.doubt_answers for select using (true);
create policy "answers_write_own"  on public.doubt_answers for insert with check (auth.uid() = answerer_id);
create policy "answers_update_own" on public.doubt_answers for update using (
  auth.uid() = answerer_id or
  auth.uid() in (select asker_id from public.doubts where id = doubt_answers.doubt_id)
);

-- ── seed data ──
-- Demo mentors live in public.users only (no auth.users row), so they
-- show up everywhere they need to but nobody can sign in as them.
-- Fixed UUIDs so re-runs are idempotent.
insert into public.users (id, email, full_name, role, bio, subjects, hourly_rate, rating, is_active, is_verified, points)
values
  ('11111111-1111-1111-1111-111111111111', 'rahul.sharma@demo.tuit', 'Rahul Sharma',
   'mentor', 'Final-year CSE student. SQL queries, normalization, indexes — explained without the textbook fluff.',
   ARRAY['DBMS','SQL','Math'], 500, 4.7, true, true, 1240),
  ('22222222-2222-2222-2222-222222222222', 'arjun.mehta@demo.tuit', 'Arjun Mehta',
   'mentor', 'BTech Chem grad, working on a quant masters. Patience with first-principles thinking.',
   ARRAY['Chemistry','Math','Physics'], 600, 4.5, true, true, 980),
  ('33333333-3333-3333-3333-333333333333', 'amrutha.vs@demo.tuit', 'Amrutha VS',
   'mentor', 'Likes whiteboarding. Will help you walk through any concept until the lightbulb hits.',
   ARRAY['DSA','Algorithms','System Design'], 450, 4.8, true, true, 1610),
  ('44444444-4444-4444-4444-444444444444', 'priya.nair@demo.tuit', 'Priya Nair',
   'mentor', 'Backend dev intern. Loves making the abstract concrete with hand-drawn diagrams.',
   ARRAY['Web Dev','DBMS','System Design'], 550, 4.6, true, true, 1420),
  ('55555555-5555-5555-5555-555555555555', 'karan.kumar@demo.tuit', 'Karan Kumar',
   'mentor', 'ML enthusiast. PyTorch, classical ML, math intuitions over formulas.',
   ARRAY['ML','Math','Python'], 650, 4.6, true, true, 1108),
  ('66666666-6666-6666-6666-666666666666', 'ishaan.gupta@demo.tuit', 'Ishaan Gupta',
   'mentor', 'Competitive programmer. Recursion, DP, graph algos — your sparring partner.',
   ARRAY['DSA','Algorithms','Recursion'], 400, 4.5, true, true, 874)
on conflict (id) do update set
  full_name    = excluded.full_name,
  bio          = excluded.bio,
  subjects     = excluded.subjects,
  hourly_rate  = excluded.hourly_rate,
  rating       = excluded.rating,
  is_active    = excluded.is_active,
  is_verified  = excluded.is_verified,
  points       = excluded.points,
  role         = excluded.role;

-- wipe + re-seed mentor sessions on every run
delete from public.sessions where mentor_id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555',
  '66666666-6666-6666-6666-666666666666'
);

-- spread sessions across the next 7 days using a fixed slot grid
do $$
declare
  mentor record;
  day_offset int;
  hour_slot int;
  hours int[] := ARRAY[9, 10, 11, 14, 16, 17, 18, 19, 20, 21];
  start_ts timestamptz;
  end_ts timestamptz;
  rate numeric;
  subj text;
begin
  for mentor in
    select id, hourly_rate, subjects from public.users
    where id in (
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444',
      '55555555-5555-5555-5555-555555555555',
      '66666666-6666-6666-6666-666666666666'
    )
  loop
    rate := mentor.hourly_rate;
    subj := mentor.subjects[1];
    for day_offset in 0..6 loop
      for hour_slot in 1..array_length(hours, 1) loop
        -- skip every other slot so the calendar isn't completely full
        if (day_offset + hour_slot) % 2 = 0 then
          start_ts := date_trunc('day', now() + (day_offset || ' days')::interval)
                      + (hours[hour_slot] || ' hours')::interval;
          end_ts := start_ts + interval '1 hour';

          insert into public.sessions
            (mentor_id, title, subject, session_type, start_time, end_time, price, max_students, current_bookings, status)
          values
            (mentor.id,
             subj || ' help session',
             subj,
             'one_on_one',
             start_ts,
             end_ts,
             rate,
             1, 0, 'available');

          -- every third slot also gets a cheaper group session
          if hour_slot % 3 = 0 then
            insert into public.sessions
              (mentor_id, title, subject, session_type, start_time, end_time, price, max_students, current_bookings, status)
            values
              (mentor.id,
               subj || ' group study',
               subj,
               'group',
               start_ts,
               end_ts + interval '15 minutes',
               round(rate * 0.36),
               4, 0, 'available');
          end if;
        end if;
      end loop;
    end loop;
  end loop;
end $$;

-- a few seed doubts so the board doesn't render empty
delete from public.doubts where asker_id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555',
  '66666666-6666-6666-6666-666666666666'
);

insert into public.doubts (asker_id, title, body, tags, upvotes, answer_count, views, status, created_at)
values
  ('66666666-6666-6666-6666-666666666666',
   'Why does my recursive memoization solution still TLE on LeetCode 322 (Coin Change)?',
   'I''m using a Map for caching but the bottom-up tabulation runs in 12 ms vs my 1800 ms recursion. Trying to understand the constant-factor cost of function frames vs the iteration loop.',
   ARRAY['DSA','Recursion'], 142, 8, 142, 'answered', now() - interval '3 hours'),
  ('44444444-4444-4444-4444-444444444444',
   'Bias-variance tradeoff intuition for tree depth?',
   'Trying to build mental model for when deeper trees overfit vs underfit.',
   ARRAY['ML'], 24, 3, 87, 'answered', now() - interval '1 hour'),
  ('55555555-5555-5555-5555-555555555555',
   'Difference between WHERE and HAVING with GROUP BY',
   'I keep mixing them up. When does each one apply?',
   ARRAY['DBMS','SQL'], 18, 5, 64, 'answered', now() - interval '5 hours'),
  ('22222222-2222-2222-2222-222222222222',
   'useEffect runs twice in dev — is this expected?',
   'Strict mode is on. Just want to confirm before I refactor.',
   ARRAY['Web Dev','React'], 51, 2, 130, 'answered', now() - interval '8 hours'),
  ('33333333-3333-3333-3333-333333333333',
   'Stuck on linear algebra eigenvectors visualization',
   'I get the equations but I cannot see what an eigenvector is doing geometrically.',
   ARRAY['Math'], 9, 0, 42, 'open', now() - interval '1 day');

-- quick check after running:
--   select count(*) from public.users where role = 'mentor';        -- 6
--   select count(*) from public.sessions where status='available';  -- ~84+
--   select count(*) from public.doubts;                             -- 5
