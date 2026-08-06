alter table public.notices
add column if not exists target_audience text not null default 'academy';

update public.notices
set target_audience = 'academy'
where target_audience not in ('academy', 'lecture');

alter table public.notices
drop constraint if exists notices_target_audience_check;

alter table public.notices
add constraint notices_target_audience_check
check (target_audience in ('academy', 'lecture'));

create index if not exists notices_target_audience_published_created_at_idx
on public.notices (target_audience, is_published, created_at desc);

grant select (target_audience) on public.notices to anon;
grant insert (target_audience) on public.notices to anon;
grant update (target_audience) on public.notices to anon;
