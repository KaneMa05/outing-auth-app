-- Read-only student projection. Keep ASR originals and administrator review data private.
create function public.ip_practice_student_captions(p_actor jsonb,p_run_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_data jsonb; v_captions jsonb;
begin
 if p_actor->>'type' is distinct from 'student' then raise exception 'forbidden'; end if;
 -- Reuse the archive's enrollment, active-account and record-ownership checks.
 v_data:=public.ip_practice_service('get',p_actor,jsonb_build_object('runId',p_run_id));
 select coalesce(jsonb_agg(jsonb_build_object(
  'number',t.number,
  'status',case when t.audio_bytes=0 then 'unavailable' when not t.uploaded then 'uploading' else coalesce(j.status,'pending') end,
  'text',case when t.uploaded and j.status='completed' then j.transcript else '' end
 ) order by t.number),'[]'::jsonb) into v_captions
 from public.ip_practice_turns t left join public.ip_practice_transcriptions j
 on j.run_id=t.run_id and j.number=t.number and j.audio_hash=t.audio_hash
 where t.run_id=p_run_id;
 return jsonb_build_object('ok',true,'mode',v_data->'run'->>'mode','captions',v_captions);
end $$;
revoke all on function public.ip_practice_student_captions(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.ip_practice_student_captions(jsonb,uuid) to service_role;
