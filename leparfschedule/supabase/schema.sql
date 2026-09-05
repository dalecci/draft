-- ==========================================================================
-- Le Parfumier: SCHEDULE — Supabase schema
-- Run this whole file once in the Supabase SQL editor (project ikypiznimyzidmyzzoys,
-- the same project the FLAG pilot and the other J3 apps use).
--
-- The app seeds the roster, availability and store hours from the spreadsheet on
-- its first load if lps_employees is empty, so this file only creates tables.
-- Access is gated by the app PIN; the anon key is public by design, so these
-- policies simply let the anon role read and write the lps_ tables.
-- ==========================================================================

create table if not exists lps_employees (
  id          text primary key,
  name        text not null,
  stores      text[] not null default '{}',
  home_store  text,
  role        text not null default 'staff' check (role in ('staff','supervisor')),
  email       text,
  flex        boolean not null default false,   -- can be called in on OFF days
  active      boolean not null default true,
  sort        int not null default 100,
  pin         text,
  created_at  timestamptz not null default now()
);

-- Weekly availability template. dow 1 = Monday ... 7 = Sunday. Minutes since midnight.
create table if not exists lps_availability (
  id           bigserial primary key,
  employee_id  text not null references lps_employees(id) on delete cascade,
  dow          smallint not null check (dow between 1 and 7),
  start_min    smallint not null,
  end_min      smallint not null,
  store        text not null,
  unique (employee_id, dow)
);

create table if not exists lps_time_off (
  id           bigserial primary key,
  employee_id  text not null references lps_employees(id) on delete cascade,
  date         date not null,
  note         text,
  unique (employee_id, date)
);

create table if not exists lps_must_work (
  id           bigserial primary key,
  employee_id  text not null references lps_employees(id) on delete cascade,
  date         date not null,
  start_min    smallint not null,
  end_min      smallint not null,
  store        text not null,
  note         text
);

create table if not exists lps_shifts (
  id           uuid primary key default gen_random_uuid(),
  week_start   date not null,
  date         date not null,
  employee_id  text not null references lps_employees(id) on delete cascade,
  store        text not null,
  start_min    smallint not null,
  end_min      smallint not null,
  locked       boolean not null default false,
  source       text not null default 'algo',   -- template | fill | must | manual | swap
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists lps_shifts_week_idx on lps_shifts(week_start);
create index if not exists lps_shifts_emp_idx  on lps_shifts(employee_id, date);

create table if not exists lps_swap_requests (
  id              uuid primary key default gen_random_uuid(),
  from_employee   text not null references lps_employees(id) on delete cascade,
  to_employee     text not null references lps_employees(id) on delete cascade,
  from_shift_id   uuid references lps_shifts(id) on delete set null,   -- the shift the requester gives
  to_shift_id     uuid references lps_shifts(id) on delete set null,   -- the shift the requester takes (null = give-away / cover)
  kind            text not null default 'swap' check (kind in ('swap','cover')),
  message         text,
  status          text not null default 'pending_peer'
                    check (status in ('pending_peer','pending_supervisor','approved','declined_peer','declined_supervisor','cancelled')),
  from_snapshot   jsonb,   -- copy of the shifts at request time, so history survives edits
  to_snapshot     jsonb,
  supervisor_note text,
  peer_at         timestamptz,
  decided_at      timestamptz,
  decided_by      text,
  decided_by_name text,
  created_at      timestamptz not null default now()
);
create index if not exists lps_swaps_status_idx on lps_swap_requests(status);

create table if not exists lps_notifications (
  id           uuid primary key default gen_random_uuid(),
  employee_id  text not null references lps_employees(id) on delete cascade,
  kind         text not null,          -- swap_ask | swap_peer_ok | swap_peer_no | swap_approve_needed | swap_approved | swap_declined
  title        text not null,
  body         text,
  swap_id      uuid references lps_swap_requests(id) on delete cascade,
  off_id       uuid,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists lps_notes_emp_idx on lps_notifications(employee_id, read);

create table if not exists lps_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ===== ROW LEVEL SECURITY: PIN-gated app, anon role may read and write ====
do $$
declare t text;
begin
  foreach t in array array['lps_employees','lps_availability','lps_time_off','lps_must_work',
                           'lps_shifts','lps_swap_requests','lps_notifications','lps_settings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "anon all" on %I', t);
    execute format('create policy "anon all" on %I for all to anon using (true) with check (true)', t);
    execute format('drop policy if exists "authenticated all" on %I', t);
    execute format('create policy "authenticated all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ===== REALTIME: the app listens for live changes on these ==============
do $$
begin
  begin alter publication supabase_realtime add table lps_shifts;         exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table lps_swap_requests;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table lps_notifications;  exception when duplicate_object then null; end;
end $$;

-- One row per person / date / store / start. Lets two phones that both open a
-- fresh week race to build it without producing duplicates.
create unique index if not exists lps_shifts_unique_idx on lps_shifts(employee_id, date, store, start_min);

-- ===== V2 ================================================================
-- Block-out and PTO requests. Approved ones count as time off for the solver.
create table if not exists lps_off_requests (
  id               uuid primary key default gen_random_uuid(),
  employee_id      text not null references lps_employees(id) on delete cascade,
  kind             text not null default 'blockout' check (kind in ('blockout','pto')),
  date_from        date not null,
  date_to          date not null,
  reason           text,
  status           text not null default 'pending' check (status in ('pending','approved','declined','cancelled')),
  supervisor_note  text,
  decided_by       text,
  decided_by_name  text,
  decided_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists lps_off_emp_idx on lps_off_requests(employee_id, status);

-- Week snapshots: automatic before every rebuild (undo), and named saves.
create table if not exists lps_snapshots (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null,
  label       text not null,
  kind        text not null default 'auto' check (kind in ('auto','saved')),
  shifts      jsonb not null default '[]',
  created_at  timestamptz not null default now()
);
create index if not exists lps_snapshots_week_idx on lps_snapshots(week_start);

-- Special availability: a different weekly pattern for a date range.
create table if not exists lps_availability_periods (
  id           uuid primary key default gen_random_uuid(),
  employee_id  text not null references lps_employees(id) on delete cascade,
  label        text,
  date_from    date not null,
  date_to      date not null,
  pattern      jsonb not null default '{}',   -- { "1": {start_min, end_min, store}, ... }
  created_at   timestamptz not null default now()
);

-- What the solver learned from manual edits (LEARN button), for the record.
create table if not exists lps_learned (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null,
  note        text,
  by_name     text,
  changes     jsonb not null default '[]',
  created_at  timestamptz not null default now()
);

-- Upgrading from V1? These add the new columns to existing tables.
alter table lps_employees      add column if not exists pin text;
alter table lps_swap_requests  add column if not exists decided_by_name text;
alter table lps_notifications  add column if not exists off_id uuid;

do $$
declare t text;
begin
  foreach t in array array['lps_off_requests','lps_snapshots','lps_availability_periods','lps_learned']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "anon all" on %I', t);
    execute format('create policy "anon all" on %I for all to anon using (true) with check (true)', t);
    execute format('drop policy if exists "authenticated all" on %I', t);
    execute format('create policy "authenticated all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
do $$
begin
  begin alter publication supabase_realtime add table lps_off_requests; exception when duplicate_object then null; end;
end $$;
