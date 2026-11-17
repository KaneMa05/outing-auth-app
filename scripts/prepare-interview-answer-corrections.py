"""Prepare guarded answer-only SQL and synchronize local seed data; never deploy.

Usage: python3 scripts/prepare-interview-answer-corrections.py [--apply-local]
The captured database snapshot is read-only evidence. The generated SQL needs
the user's final deployment approval before execution against any hosted DB.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / 'artifacts/interview-answer-review-20261117'
DATA = ROOT / 'scripts/data'

def read(path):
    return json.loads(path.read_text())

def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'

def sql_literal(value):
    return "'" + json.dumps(value, ensure_ascii=False).replace("'", "''") + "'::jsonb"

def sql_for(patches, rollback=False):
    rows = [dict(p, before=p['after'], after=p['before']) if rollback else p for p in patches]
    return """-- Answer-only data correction. PENDING FINAL USER APPROVAL; do not auto-deploy.
-- Exact question metadata and old/new answer guards; reruns are idempotent.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create temporary table answer_patch (
 occurrence_id text primary key, question_id text not null, prompt text not null,
 revision integer not null, status text not null, before text not null, after text not null
) on commit drop;
insert into answer_patch
select x.occurrence_id,x.question_id,x.prompt,x.revision,x.status,x.before,x.after
from jsonb_to_recordset(""" + sql_literal(rows) + """) as x(
 occurrence_id text, question_id text, prompt text, revision integer, status text, before text, after text);
do $review$
begin
 perform 1 from public.ip_questions q join answer_patch p on p.question_id=q.id
 order by q.id for update of q;
 perform 1 from public.ip_occurrences o join answer_patch p on p.occurrence_id=o.id
 order by o.id for update of o;
 if exists (
  select 1 from answer_patch p
  left join public.ip_questions q on q.id=p.question_id
  left join public.ip_occurrences o on o.id=p.occurrence_id
  where q.id is null or q.category is distinct from 'job'
   or q.prompt is distinct from p.prompt or q.revision is distinct from p.revision
   or q.status is distinct from p.status or o.question_id is distinct from p.question_id
   or (o.answer is distinct from p.before and o.answer is distinct from p.after)
 ) then raise exception 'answer_review_conflict: refresh snapshot and review changed rows'; end if;
end $review$;
create temporary table changed_answer_questions on commit drop as
select distinct p.question_id from answer_patch p join public.ip_occurrences o on o.id=p.occurrence_id
where o.answer is distinct from p.after;
update public.ip_occurrences o set answer=p.after from answer_patch p
where o.id=p.occurrence_id and o.answer=p.before and o.answer is distinct from p.after;
-- Authored rubrics are retained as drafts, with stale derived text/terms flagged.
-- Saved attempts, recordings, reports and question publication states are untouched.
update public.ip_question_rubrics r set status='draft',reviewer='',reviewed_at=null,
 revision=r.revision+1,updated_at=now(),
 verification_note='2026-11-17 해설 수정: 원문 해설·용어 후보·채점 기준 재검토 필요',
 source_draft=jsonb_set(r.source_draft,'{flags}',
  coalesce(r.source_draft->'flags','[]'::jsonb) || '["source_answer_changed"]'::jsonb)
where r.question_id in (select question_id from changed_answer_questions);
do $review$
begin
 if exists(select 1 from answer_patch p join public.ip_occurrences o on o.id=p.occurrence_id
  where o.answer is distinct from p.after) then raise exception 'answer_review_verification_failed'; end if;
end $review$;
select count(*) as changed_questions from changed_answer_questions;
commit;
"""

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply-local', action='store_true')
    args = parser.parse_args()
    snapshot_path = REVIEW / 'all-job-snapshot.json'
    questions = read(snapshot_path)['questions']
    corrections = read(DATA / 'interview-answer-corrections-20261117.json')
    manifest_path = DATA / 'interview-answer-patch-20261117.json'
    previous = read(manifest_path) if manifest_path.exists() else None
    previous_after = {p['occurrence_id']: p['after'] for p in previous['patches']} if previous else {}
    question_map = {q['id']: q for q in questions}
    replacements = {}
    for correction in corrections['replacements']:
        q = question_map[correction['question_id']]
        ids = {a['id'] for a in q['answers']}
        selected = set(correction.get('occurrence_ids', ids))
        assert selected and selected <= ids, 'Unknown occurrence'
        for oid in selected:
            assert oid not in replacements, 'Duplicate correction: ' + oid
            replacements[oid] = correction
    # Remove standalone layout labels only, never numerical/scientific statements.
    ratio = re.compile(r'(?m)^[ \t]*\d+[ \t]*:[ \t]*\d+[ \t]*면접(?:[ \t]*/[ \t]*\d+[ \t]*:[ \t]*\d+[ \t]*면접)*[ \t]*$')
    patches = []
    for q in questions:
        assert q['category'] == 'job'
        for a in q['answers']:
            before = a['answer']
            after = replacements[a['id']]['answer'] if a['id'] in replacements else before
            after = ratio.sub('', after).strip()
            after = after.replace('상대 선박이 자국 또는 제3국 영해에 들어가면 종료됩니다.',
                '추적 대상 선박이 그 선박의 기국 또는 제3국 영해에 들어가면 추적권은 종료됩니다.')
            if after != before:
                assert after and len(after) <= 20000, q['id']
                patches.append(dict(occurrence_id=a['id'], question_id=q['id'], prompt=q['prompt'],
                    revision=q['revision'], status=q['status'], before=before, after=after))
    assert len({p['occurrence_id'] for p in patches}) == len(patches)
    manifest = dict(date='2026-11-17', snapshot_sha256=hashlib.sha256(snapshot_path.read_bytes()).hexdigest(),
        application='pending_final_user_approval', patches=patches)
    receipt_path = ROOT / 'docs/releases/20261117-interview-answer-application.json'
    if receipt_path.exists():
        receipt = read(receipt_path)
        patch_hash = hashlib.sha256(json.dumps(patches,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        if receipt.get('application') == 'applied' and receipt.get('patches_sha256') == patch_hash:
            manifest['application'] = 'applied'
            manifest['applied_at'] = receipt['verification']['verified_at']
    if previous:
        assert previous['snapshot_sha256'] == manifest['snapshot_sha256'], 'Snapshot changed; reconcile previous patches first'
    if args.apply_local:
        corpus_path = ROOT / 'supabase/seeds/interview-corpus.json'
        corpus = read(corpus_path)
        occurrences = {o['id']: o for o in corpus['occurrences']}
        # Validate all before writing; permit an already-applied local correction.
        local = [p for p in patches if p['occurrence_id'] in occurrences]
        for p in local:
            o = occurrences[p['occurrence_id']]
            assert o['question_id'] == p['question_id']
            assert o['answer'] in (p['before'], p['after'], previous_after.get(p['occurrence_id'])), 'Local conflict: '+p['occurrence_id']
        for p in local:
            occurrences[p['occurrence_id']]['answer'] = p['after']
        # Keep generated import SQL in sync without regenerating question metadata.
        sql_path = ROOT / 'supabase/seeds/interview-corpus.sql'
        sql = sql_path.read_text()
        pattern = re.compile(r"(insert into public\.ip_occurrences select \* from jsonb_populate_recordset\(null::public\.ip_occurrences, )'((?:''|[^'])*)'(::jsonb\) on conflict \(id\) do nothing;)")
        ids = {p['occurrence_id'] for p in local}
        def replace_batch(m):
            batch = json.loads(m[2].replace("''", "'"))
            if not any(o['id'] in ids for o in batch): return m[0]
            for o in batch:
                if o['id'] in ids: o['answer'] = occurrences[o['id']]['answer']
            return m[1] + sql_literal(batch) + m[3][len('::jsonb'):]
        revised, batches = pattern.subn(replace_batch, sql)
        assert batches > 0, 'Seed SQL structure changed'
        corpus_path.write_text(json.dumps(corpus,ensure_ascii=False,indent=2)+'\n')
        sql_path.write_text(revised)
    target = ROOT / 'supabase/reviews'
    target.mkdir(exist_ok=True)
    (target / 'interview-answer-corrections-20261117.sql').write_text(sql_for(patches))
    (target / 'interview-answer-corrections-20261117-rollback.sql').write_text(sql_for(patches, True))
    manifest_path.write_text(dump(manifest))
    print(dump(dict(questions=len({p['question_id'] for p in patches}), occurrences=len(patches),
        local_applied=args.apply_local, hosted_applied_by_this_command=False, recorded_application=manifest['application'])))

if __name__ == '__main__': main()
