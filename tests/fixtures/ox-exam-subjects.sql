-- Independent local fixture for the app's administrator-configured exam subjects.
create table public.exam_subject_settings(track text not null,subject text not null,is_active boolean not null default true,unique(track,subject));
grant select on public.exam_subject_settings to service_role;
update public.students set track='공채' where track is null;
alter table public.students alter column track set default '공채';
