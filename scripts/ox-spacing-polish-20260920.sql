begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $polish$
declare target record; saved public.ox_questions; changed public.ox_questions;
replacement jsonb; edit record; revised text; plain text;
begin
 for target in select q.id from public.ox_questions q
 where exists(select 1 from jsonb_each_text(q.entry) f where f.key in ('prompt','context','explanation','explanation_html') and f.value<>regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(f.value,'(이(?:</?u>)*유)((?:</?u>)*)((?:</?u>)*없(?:</?u>)*이)','\1 \2\3','g'),'(변(?:</?u>)*호(?:</?u>)*인)((?:</?u>)*)((?:</?u>)*없(?:</?u>)*이)','\1 \2\3','g'),'(출(?:</?u>)*석)((?:</?u>)*)((?:</?u>)*없(?:</?u>)*이)','\1 \2\3','g'),'(경(?:</?u>)*우)((?:</?u>)*) ((?:</?u>)*에(?:</?u>)*는)','\1\2\3','g'),'(해(?:</?u>)*당)((?:</?u>)*) ((?:</?u>)*하(?:</?u>)*는)','\1\2\3','g'),' +((</?u>)*[,.])','\1','g'),'(제[0-9]+) +조','\1조','g'),'조의 +([0-9]+)','조의\1','g')) order by q.id loop
  perform pg_advisory_xact_lock(hashtextextended('ox-question:'||target.id,0));
  select * into strict saved from public.ox_questions where id=target.id for update;
  replacement:=saved.entry;
  for edit in select * from jsonb_each_text(saved.entry) where key in ('prompt','context','explanation','explanation_html') loop
   revised:=regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(edit.value,'(이(?:</?u>)*유)((?:</?u>)*)((?:</?u>)*없(?:</?u>)*이)','\1 \2\3','g'),'(변(?:</?u>)*호(?:</?u>)*인)((?:</?u>)*)((?:</?u>)*없(?:</?u>)*이)','\1 \2\3','g'),'(출(?:</?u>)*석)((?:</?u>)*)((?:</?u>)*없(?:</?u>)*이)','\1 \2\3','g'),'(경(?:</?u>)*우)((?:</?u>)*) ((?:</?u>)*에(?:</?u>)*는)','\1\2\3','g'),'(해(?:</?u>)*당)((?:</?u>)*) ((?:</?u>)*하(?:</?u>)*는)','\1\2\3','g'),' +((</?u>)*[,.])','\1','g'),'(제[0-9]+) +조','\1조','g'),'조의 +([0-9]+)','조의\1','g');
   if replace(edit.value,' ','') is distinct from replace(revised,' ','') then raise exception 'Nonspace change %',target.id; end if;
   if revised is distinct from edit.value then replacement:=jsonb_set(replacement,array[edit.key],to_jsonb(revised)); end if;
  end loop;
  if replacement=saved.entry then continue; end if;
  plain:=replace(replace(replace(replace(replace(replace(regexp_replace(replacement->>'explanation_html','</?u>','','g'),'&lt;','<'),'&gt;','>'),'&quot;','"'),'&#39;',chr(39)),'&#x27;',chr(39)),'&amp;','&');
  if plain is distinct from replacement->>'explanation' then raise exception 'HTML mismatch %',target.id; end if;
  update public.ox_questions set entry=replacement,revision=revision+1,updated_at=now() where id=target.id returning * into changed;
  insert into public.ox_question_history(question_id,actor,before_value,after_value)
  values(target.id,'spacing-correction-polish-20260920',to_jsonb(saved),to_jsonb(changed));
 end loop;
end $polish$;
commit;
select count(*) corrected_questions from public.ox_question_history where actor='spacing-correction-polish-20260920';
