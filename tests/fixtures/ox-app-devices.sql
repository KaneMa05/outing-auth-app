-- Minimal app dependencies; tests then load the actual base device SQL.
alter table public.students add column password_hash text default 'fixture-password';
alter table public.students add column device_token text;
alter table public.students add column app_registered_at timestamptz;
alter table public.students add column track text;
alter table public.students add column gender text;
create schema extensions;
create function extensions.digest(text,text) returns bytea language sql as $$select sha256(convert_to($1,'UTF8'))$$;
create table public.student_registration_events (
 id bigint generated always as identity primary key,student_id text,student_name text,
 event_type text check(event_type in ('registered','reset')),device_token text,reason text,actor text,
 client_display_mode text,client_user_agent text,created_at timestamptz default now()
);
