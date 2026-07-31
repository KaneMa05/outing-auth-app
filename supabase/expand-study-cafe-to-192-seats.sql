begin;

alter table public.study_cafe_presence
drop constraint if exists study_cafe_presence_seat_number_check;

alter table public.study_cafe_presence
add constraint study_cafe_presence_seat_number_check
check (seat_number between 1 and 192)
not valid;

alter table public.study_cafe_presence
validate constraint study_cafe_presence_seat_number_check;

commit;
