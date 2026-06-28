-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- One generic key/value table holds the app config and the metrics history.

create table if not exists kv_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- Lock it down: enable RLS with no policies, so only the service_role key
-- (used by the server, which bypasses RLS) can read/write. The anon/public key cannot.
alter table kv_store enable row level security;
