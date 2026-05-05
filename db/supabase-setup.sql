-- Initial schema. Paste into Supabase SQL Editor and run.
-- Idempotent, safe to re-run.

-- users: profile row 1:1 with auth.users
create table if not exists public.users (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text unique not null,
  full_name       text not null default '',
  role            text not null default 'student' check (role in ('student','mentor','admin')),
  bio             text,
  subjects        text[] default '{}',
  hourly_rate     numeric(10,2),
  rating          numeric(3,2),
  is_active       boolean not null default true,
  is_verified     boolean not null default false,
  avatar_url      text,
  created_at      timestamptz not null default now()
);

-- old schema had a NOT NULL password_hash column that broke signup; drop the constraint if it's still around
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='users' and column_name='password_hash') then
    execute 'alter table public.users alter column password_hash drop not null';
  end if;
end $$;

-- sessions: a mentor's bookable slot
create table if not exists public.sessions (
  id                uuid primary key default gen_random_uuid(),
  mentor_id         uuid not null references public.users(id) on delete cascade,
  title             text not null,
  subject           text default 'General',
  session_type      text not null default 'one_on_one' check (session_type in ('one_on_one','group')),
  start_time        timestamptz not null,
  end_time          timestamptz not null,
  price             numeric(10,2) default 0,
  max_students      int not null default 1,
  current_bookings  int not null default 0,
  status            text not null default 'available' check (status in ('available','full','completed','cancelled')),
  created_at        timestamptz not null default now()
);
create index if not exists sessions_mentor_idx on public.sessions(mentor_id);
create index if not exists sessions_status_idx on public.sessions(status);
create index if not exists sessions_start_idx  on public.sessions(start_time);

-- bookings: a student claiming a session slot
create table if not exists public.bookings (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  student_id      uuid not null references public.users(id) on delete cascade,
  status          text not null default 'confirmed' check (status in ('pending','confirmed','completed','cancelled')),
  payment_status  text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  payment_amount  numeric(10,2) default 0,
  notes           text,
  booked_at       timestamptz not null default now(),
  unique (session_id, student_id)
);
create index if not exists bookings_session_idx on public.bookings(session_id);
create index if not exists bookings_student_idx on public.bookings(student_id);

-- on signup, copy auth.users → public.users so the rest of the app has a profile to read
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.users    enable row level security;
alter table public.sessions enable row level security;
alter table public.bookings enable row level security;

-- users
drop policy if exists "users_read_all"   on public.users;
drop policy if exists "users_update_own" on public.users;
drop policy if exists "users_insert_own" on public.users;

create policy "users_read_all" on public.users
  for select using (true);

create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

create policy "users_insert_own" on public.users
  for insert with check (auth.uid() = id);

-- sessions
drop policy if exists "sessions_read_all"     on public.sessions;
drop policy if exists "sessions_mentor_write" on public.sessions;

create policy "sessions_read_all" on public.sessions
  for select using (true);

create policy "sessions_mentor_write" on public.sessions
  for all using (auth.uid() = mentor_id) with check (auth.uid() = mentor_id);

-- TODO: students need to bump current_bookings/status during the booking
-- flow. Wide-open update for now; replace with a stored procedure when we
-- have a server.
drop policy if exists "sessions_student_update_count" on public.sessions;
create policy "sessions_student_update_count" on public.sessions
  for update using (true) with check (true);

-- bookings
drop policy if exists "bookings_student_read"   on public.bookings;
drop policy if exists "bookings_mentor_read"    on public.bookings;
drop policy if exists "bookings_student_write"  on public.bookings;
drop policy if exists "bookings_student_update" on public.bookings;

create policy "bookings_student_read" on public.bookings
  for select using (auth.uid() = student_id);

-- mentors can see bookings on their own sessions
create policy "bookings_mentor_read" on public.bookings
  for select using (
    auth.uid() in (select mentor_id from public.sessions where id = bookings.session_id)
  );

create policy "bookings_student_write" on public.bookings
  for insert with check (auth.uid() = student_id);

create policy "bookings_student_update" on public.bookings
  for update using (auth.uid() = student_id);

-- enable realtime on bookings so the mentor dashboard updates live
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings'
  ) then
    execute 'alter publication supabase_realtime add table public.bookings';
  end if;
end $$;

-- sanity check:
--   select * from public.users    limit 5;
--   select * from public.sessions limit 5;
--   select * from public.bookings limit 5;
