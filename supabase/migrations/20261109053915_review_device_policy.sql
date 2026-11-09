begin;
-- Empty by default. Only an operator can change a review-account device policy.
-- NULL max_devices means unlimited; NULL expires_at means no expiry.
-- Normal students keep two devices; password, activity and token checks are unchanged.
create table public.student_review_device_limits (
 student_id text primary key references public.students(id) on delete cascade,
 max_devices integer check(max_devices between 3 and 100),
 expires_at timestamptz,
 reason text not null check(length(btrim(reason)) between 1 and 500)
);
alter table public.student_review_device_limits enable row level security;
revoke all on public.student_review_device_limits from public,anon,authenticated;
grant select,insert,update,delete on public.student_review_device_limits to service_role;

do $$
declare src text;
begin
 select pg_get_functiondef('public.register_student_device(text,text,text,text,text,text,text,text,text)'::regprocedure) into src;
 if strpos(src,'if v_active_count >= 2 then')=0 then
   raise exception 'Unexpected device registration definition: review policy before applying';
 end if;
 execute replace(src,'if v_active_count >= 2 then',
   'if v_active_count >= 2 and not exists(select 1 from public.student_review_device_limits where student_id=p_student_id and (expires_at is null or expires_at>now()) and (max_devices is null or v_active_count<max_devices)) then');
end;
$$;
commit;
