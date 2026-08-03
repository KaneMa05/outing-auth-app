begin;

alter table public.study_cafe_profiles
add column if not exists status_message text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'study_cafe_profiles_status_message_check'
      and conrelid = 'public.study_cafe_profiles'::regclass
  ) then
    alter table public.study_cafe_profiles
    add constraint study_cafe_profiles_status_message_check
    check (status_message is null or char_length(trim(status_message)) between 1 and 40);
  end if;
end
$$;

commit;
