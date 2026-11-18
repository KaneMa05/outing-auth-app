-- Keep interview announcements out of legacy student snapshots and writes.
begin;

create table if not exists public.interview_notices (
  id text primary key,
  title text not null,
  body text not null,
  image_path text,
  target_audience text not null default 'interview' check (target_audience = 'interview'),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists interview_notices_published_created_at_idx
  on public.interview_notices (is_published, created_at desc, id);
alter table public.interview_notices enable row level security;
revoke all on public.interview_notices from public, anon, authenticated;
grant select, insert, update, delete on public.interview_notices to service_role;

-- The authenticated APIs check teacher permissions or current student enrollment.
-- Existing student apps continue to read and save public.notices unchanged.
insert into public.interview_notices (id, title, body, is_published, created_at, updated_at)
values (
  'interview-home-announcement-20261109',
  '면접반 수강 안내',
  $notice$(0) 오프반 : 11.9 전까지 사전과제 이행

(1) 적성 및 면접기출교재 발송일 : 11.9(월)
인강생은 인강사이트 주소로 발송, 오프라인은 현장 및 택배수령(신청시 작성 주소)
*적성 pdf 비번 : ronpark1234 혹은 RONPARK1234

(2) 인성검사 온라인검사 실시일 : 11.10(화)
인강,오프라인생 검사 문자 발송$notice$,
  true, '2026-11-09T00:00:00+09:00', '2026-11-09T00:00:00+09:00'
) on conflict (id) do nothing;

commit;
