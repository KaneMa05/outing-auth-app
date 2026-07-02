-- Repairs a missing Supabase migration history table.
-- Safe to run more than once.

create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
