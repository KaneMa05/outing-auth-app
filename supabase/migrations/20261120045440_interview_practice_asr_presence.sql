begin;
set local lock_timeout='1s';
set local statement_timeout='15s';
-- A separate signal is needed even while the transcription queue is empty.
create table public.ip_practice_asr_worker_presence (
 id boolean primary key default true check(id),
 state text not null check(state in ('starting','idle','processing','error','stopped')),
 seen_at timestamptz not null default now()
);
alter table public.ip_practice_asr_worker_presence enable row level security;
revoke all on public.ip_practice_asr_worker_presence from public,anon,authenticated;
grant select,insert,update on public.ip_practice_asr_worker_presence to service_role;

create function public.ip_practice_asr_presence(p_state text) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if p_state is null or p_state not in ('starting','idle','processing','error','stopped') then
  raise exception 'invalid_request';
 end if;
 insert into public.ip_practice_asr_worker_presence(id,state,seen_at) values(true,p_state,now())
 on conflict(id) do update set state=excluded.state,seen_at=excluded.seen_at;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.ip_practice_asr_presence(text) from public,anon,authenticated;
grant execute on function public.ip_practice_asr_presence(text) to service_role;

commit;
