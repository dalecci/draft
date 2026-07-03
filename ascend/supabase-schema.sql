-- ============================================================================
-- Ascend — Supabase schema + Row-Level Security
-- Run this in your Supabase project: SQL Editor → paste → Run.
-- Enables the "real cloud" mode: per-user login + synced, backed-up state.
-- ============================================================================

-- One JSON blob of app state per authenticated user (simple + flexible for v1).
create table if not exists public.app_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row-Level Security: a user can only read/write their OWN row. This is the
-- database-level guarantee that a parent/student never sees another family.
alter table public.app_state enable row level security;

drop policy if exists "own row select" on public.app_state;
create policy "own row select" on public.app_state
  for select using (auth.uid() = user_id);

drop policy if exists "own row upsert" on public.app_state;
create policy "own row upsert" on public.app_state
  for insert with check (auth.uid() = user_id);

drop policy if exists "own row update" on public.app_state;
create policy "own row update" on public.app_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- NOTE: Supabase Pro keeps automatic daily backups of this table (that plus the
-- app's on-device mirror + downloadable JSON export = the "double save").
-- NEVER expose the service_role key in the browser; the app uses only the anon
-- key, and RLS above is what keeps data private.
