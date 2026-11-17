"""Render the complete review ledger and a local, searchable approval report."""
import html
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / 'artifacts/interview-answer-review-20261117'
OUT = ROOT / 'docs/releases'

def read(p):
    return json.loads(p.read_text())

def esc(s):
    return html.escape(str(s))

def links(urls):
    return ' · '.join(f'<a href="{esc(u)}" target="_blank" rel="noreferrer">근거 {i+1}</a>' for i,u in enumerate(dict.fromkeys(urls)))

def main():
    snapshot = read(REVIEW / 'all-job-snapshot.json')
    groups = read(REVIEW / 'answer-groups.json')
    questions = {q['id']: q for q in snapshot['questions']}
    manifest = read(ROOT / 'scripts/data/interview-answer-patch-20261117.json')
    corrections = read(ROOT / 'scripts/data/interview-answer-corrections-20261117.json')
    reviews = [read(REVIEW / f'agent-{name}.json') for name in 'abc']
    ledger = sorted([r for review in reviews for r in review['reviewed_groups']],key=lambda r:r['index'])
    assert [r['index'] for r in ledger] == list(range(len(groups))), 'Incomplete/duplicate group coverage'
    covered = {q['id'] for g in groups for q in g['questions']}
    assert covered == questions.keys(), 'Incomplete question coverage'
    findings = [r for review in reviews for r in review['findings']]
    extra_path = REVIEW / 'parent-review.json'
    extra = read(extra_path) if extra_path.exists() else {}
    overrides = {r['index']:r for r in extra.get('review_overrides',[])}
    ledger = [overrides.get(r['index'],r) for r in ledger]
    resolved = set(extra.get('resolved_group_indices',[]))
    unresolved = [r for r in findings if r['status']=='unresolved' and r['group_index'] not in resolved]
    def content(text):
        text = re.sub(r'(?m)^[ \t]*(?:\d+\s*:\s*\d+\s*면접(?:\s*/\s*\d+\s*:\s*\d+\s*면접)*|프로파일러 면접|인성 질문\(2017~2018년\))[ \t]*$', '', text)
        return re.sub(r'\s+', '',text)
    content_questions = {p['question_id'] for p in manifest['patches'] if content(p['before'])!=content(p['after'])}
    changed_questions = {p['question_id'] for p in manifest['patches']}
    for r in ledger:
        r['question_ids'] = [q['id'] for q in groups[r['index']]['questions']]
    counts = dict(questions=len(questions), question_status=dict(Counter(q['status'] for q in questions.values())),
        answer_occurrences=sum(len(q['answers']) for q in questions.values()), answer_groups=len(groups),
        reviewed_groups=len(ledger), group_status=dict(Counter(r['status'] for r in ledger)),
        groups_with_source_links=sum(bool(r.get('sources')) for r in ledger),
        changed_questions=len({p['question_id'] for p in manifest['patches']}), changed_occurrences=len(manifest['patches']),
        content_changed_questions=len(content_questions), format_only_questions=len(changed_questions-content_questions),
        unresolved_questions=len({qid for r in unresolved for qid in r['question_ids']}))
    audit = dict(date='2026-11-17', scope='Current database category=job, including published/draft/archived',
        snapshot_sha256=manifest['snapshot_sha256'], application=manifest['application'], counts=counts,
        status_definition={'checked':'답변 전문과 연결 질문을 읽어 적합성·내용을 검토함. sources는 실제 대조한 참고 근거이며 모든 문장에 대한 인증을 의미하지 않음.',
            'correction':'확인된 오류 또는 질문 불일치에 대한 수정안 작성', 'unresolved':'원문·조건·공식 근거를 더 확인해야 함'},
        reviewed_groups=ledger, unresolved=unresolved, parent_notes=extra.get('notes',[]))
    OUT.mkdir(exist_ok=True)
    (OUT / '20261117-interview-answer-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
    by_question = {}
    for p in manifest['patches']: by_question.setdefault(p['question_id'],[]).append(p)
    reasons = {}
    for r in corrections['replacements']: reasons.setdefault(r['question_id'],[]).append(r)
    state = '운영 DB 반영·검증 완료 (17:54 KST) · 별도 앱 재배포 불필요' if manifest['application']=='applied' else '로컬 수정 완료 · 운영 DB 반영, 푸시, 배포 전'
    body = ['<h1>직무 문항 전체 검토</h1><p>2026년 11월 17일 · '+state+'</p>',
        '<p>'+esc(f"전체 {counts['questions']:,}개 문항 / 답변 {counts['answer_occurrences']:,}건 / 중복 답변을 묶은 {counts['answer_groups']:,}개 그룹을 모두 읽었습니다.")+'</p>',
        '<p>'+esc(f"수정 {counts['changed_questions']:,}개 문항({counts['changed_occurrences']:,}건), 추가 확인 {counts['unresolved_questions']:,}개 문항.")+'</p>',
        '<p>질문 적합성·표현·법률·기술 내용을 검토했습니다. 공식 자료와 대조한 근거를 기록했으며, 원문이나 조건이 불분명한 항목은 확정하지 않았습니다. 모든 문장의 법률·기술적 정확성을 인증하는 보고서는 아닙니다.</p>',
        '<p>기존 화면 코드는 변경하지 않았습니다. 적용 SQL은 원문 충돌 시 전체 중단하며, 중복 실행과 되돌리기를 검증했습니다. 기존 응시 기록·녹음·결과는 보존하고, 변경 문항의 채점 기준은 재검토 초안으로 표시합니다.</p>',
        '<label>검색 <input id="search" type="search" placeholder="질문, 용어, 문항 ID"></label>', '<h2>수정 전후</h2>']
    for qid,patches in by_question.items():
        q=questions[qid]; rs=reasons.get(qid,[])
        reason=' / '.join(dict.fromkeys(r['reason'] for r in rs)) or '답변에 섞인 면접 형식 표기·공백 정리 또는 추적권 종료 주체 명확화'
        body.append(f'<details class="record"><summary>{esc(q["prompt"])} <small>{esc(q["status"])}</small></summary><p class="id">{qid}</p><p>{esc(reason)}</p>')
        shown=set()
        for p in patches:
            key=(p['before'],p['after'])
            if key in shown:continue
            shown.add(key)
            body.append(f'<div class="compare"><section><h3>수정 전</h3><pre>{esc(p["before"])}</pre></section><section><h3>수정 후</h3><pre>{esc(p["after"])}</pre></section></div>')
        body.append('<p>'+links([u for r in rs for u in r.get('sources',[])])+'</p></details>')
    body.append('<h2>추가 확인이 필요한 문항</h2><p>사건명·장비 모델·원문 질문·사용 지침 등 부족한 조건이 확인되어야 확정 답변을 만들 수 있습니다.</p>')
    for r in unresolved:
        body.append('<article class="record"><h3>'+esc(' / '.join(questions[qid]['prompt'] for qid in r['question_ids']))+'</h3><p>'+esc(r['reason'])+'</p><p class="id">'+esc(', '.join(r['question_ids']))+'</p><p>'+links(r.get('sources',[]))+'</p></article>')
    body.append('<h2>전체 검토 기록</h2><p>검토 상태는 같은 답변을 공유하는 그룹 단위입니다. 각 문항별 수정 여부는 위 수정 전후 및 패치 명세에서 확인합니다.</p>')
    for r in ledger:
        title=' / '.join(q['prompt'] for q in groups[r['index']]['questions'])
        body.append(f'<details class="record"><summary>#{r["index"]} · {esc(r["status"])} · {esc(title)}</summary><p>{esc(r.get("note",""))}</p><p>{links(r.get("sources",[]))}</p></details>')
    page='''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>직무 문항 검토 · 2026-11-17</title>
<style>body{font:16px/1.65 system-ui,sans-serif;max-width:1200px;margin:40px auto;padding:0 24px;color:#172b40;background:#f8fafc}h1{font-size:30px}h2{margin-top:40px}h3{font-size:16px}a{color:#075ca8}input{font:inherit;padding:9px;width:min(70%,600px)}.record{background:white;border:1px solid #d8e1e9;border-radius:8px;margin:12px 0;padding:16px}summary{cursor:pointer;font-weight:650}small,.id{color:#66778a}.id{font-size:12px;overflow-wrap:anywhere}.compare{display:grid;grid-template-columns:1fr 1fr;gap:20px}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}section{padding:14px;background:#f2f6fa;border-radius:6px}[hidden]{display:none!important}@media(max-width:700px){.compare{grid-template-columns:1fr}}@media print{input,label{display:none}.record{break-inside:avoid}}</style><main>'''+''.join(body)+'''</main><script>document.querySelector('#search').addEventListener('input',e=>{const s=e.target.value.toLowerCase();document.querySelectorAll('.record').forEach(el=>el.hidden=!el.textContent.toLowerCase().includes(s));});</script></html>'''
    (OUT / '20261117-interview-answer-review.html').write_text(page)
    print(json.dumps(counts,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
