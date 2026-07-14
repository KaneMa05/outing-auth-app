begin;

alter table public.exam_answers
add column if not exists correct_answers integer[] not null default '{}';

update public.exam_answers
set correct_answers = array[correct_answer]
where cardinality(correct_answers) = 0
  and correct_answer is not null;

create or replace function public.sync_exam_answer_choices()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and new.correct_answers is not distinct from old.correct_answers
    and new.correct_answer is distinct from old.correct_answer then
    new.correct_answers := case
      when new.correct_answer is null then '{}'::integer[]
      else array[new.correct_answer]
    end;
  else
    select coalesce(array_agg(choice order by choice), '{}'::integer[])
    into new.correct_answers
    from (select distinct unnest(coalesce(new.correct_answers, '{}'::integer[])) as choice) choices;

    if cardinality(new.correct_answers) = 0 and new.correct_answer is not null then
      new.correct_answers := array[new.correct_answer];
    end if;
    new.correct_answer := new.correct_answers[1];
  end if;
  return new;
end;
$$;

drop trigger if exists sync_exam_answer_choices on public.exam_answers;
create trigger sync_exam_answer_choices
before insert or update of correct_answer, correct_answers
on public.exam_answers
for each row execute function public.sync_exam_answer_choices();

alter table public.exam_answers
drop constraint if exists exam_answers_correct_answers_check;

alter table public.exam_answers
add constraint exam_answers_correct_answers_check
check (
  cardinality(correct_answers) <= 4
  and array_position(correct_answers, null) is null
  and correct_answers <@ array[1, 2, 3, 4]::integer[]
);

drop policy if exists "anon_exam_answers_insert" on public.exam_answers;
create policy "anon_exam_answers_insert"
on public.exam_answers
for insert
to anon
with check (
  question_number > 0
  and (correct_answer is null or correct_answer between 1 and 4)
  and cardinality(correct_answers) <= 4
  and array_position(correct_answers, null) is null
  and correct_answers <@ array[1, 2, 3, 4]::integer[]
);

drop policy if exists "anon_exam_answers_update" on public.exam_answers;
create policy "anon_exam_answers_update"
on public.exam_answers
for update
to anon
using (true)
with check (
  question_number > 0
  and (correct_answer is null or correct_answer between 1 and 4)
  and cardinality(correct_answers) <= 4
  and array_position(correct_answers, null) is null
  and correct_answers <@ array[1, 2, 3, 4]::integer[]
);

commit;
