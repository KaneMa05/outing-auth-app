"""Build an exact-question classification review and guarded deployment input.

No network, publication, audio synthesis or production writes. Original import is
immutable; category changes require a wording-checked decision in the overrides.
"""
import collections
import csv
import hashlib
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'supabase/seeds'
VERSION = 'interview-intent-v2'
LABELS = {'job': '직무', 'personality': '인성'}
SUBTYPES = {
    'technical_practice': '직무 지식·현장 대응',
    'law_policy_current_affairs': '법률·제도·정책·시사',
    'values_fit': '공직 가치·지원 동기·적합성',
    'responsibility': '책임·실수 인정·역량 보완',
    'interpersonal_judgement': '소통·협업·상황 판단',
    'ethics': '공직 윤리·청렴·인권 감수성',
    'profile': '자기이해·경력 확인',
    'language_profile': '외국어 자기소개·진로',
    'experience': '개인 경험·행동·성장',
    'social_opinion': '사회 현상에 대한 관점·가치 판단',
    'policy_opinion': '법률·정책·조직 운영에 대한 논거',
    'emotion_regulation': '감정 조절·스트레스 대처',
    'strength_evidence': '개인 강점·기여 근거',
    'context': '원문 문맥 확인 전 확정 보류',
    'rapport': '안부·진행·소감',
}


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def infer_subtype(q):
    """Intent-family proposals. Exact reading decisions control primary changes."""
    text = q['prompt']
    if q['category'] == 'job':
        if re.search(r'정책|제도|법.*(?:찬반|견해)|(?:찬성|반대)|수사권.*생각|본청.*이동|임금피크제.*(?:생각|근거)', text):
            return 'policy_opinion', '명시된 법률·제도·정책에 대한 분석과 논거를 확인합니다. 찬반 입장 자체를 단일 지식 정답으로 채점하지 않습니다.'
        law_words = re.findall(r'[가-힣]+법(?!칙)', text)
        named_law = any(not word.endswith(('방법', '항법', '통항법', '사용법', '조작법', '조종법', '측정법', '계산법', '처치법', '진압법', '신호법', '관측법', '방위법', '정비법', '예방법')) and word not in ('불법', '적법', '위법', '기법', '편법') for word in law_words)
        if named_law or re.search(
            r'법률|법령|헌법|형법|형사|민법|수사|체포|구속|고소|고발|죄|기소유예|선고유예|집행유예|증거|권리|권한|규정|의무|인재상|핵심가치|정책|시사|뉴스|기사|사건|정부|제도|민주주의|대통령|국가.*요소|국가예산|국가 예산|'
            r'국경일|현충일|광복절|제헌절|독도|이어도|어업협정|[0-9][.·][0-9]|임진왜란|명량|병자호란|남북|통일|사드|브렉시트|한중|한일|공무원헌장|공무원 헌장|'
            r'해양경찰.*(?:업무|임무|조직|역사|하는 일|하는가|무슨 일|날)|해경.*(?:업무|임무|조직|역사|하는 일|하는가|날)|(?:해경|해양경찰).*(?:육경|해군|소방)|관할|경찰서.*(?:개|숫자)|지방청|중국어.*직무|공무원.*기업', text):
            return 'law_policy_current_affairs', '법률·규정·기관 사실·정책·시사에 관한 설명과 근거를 확인합니다.'
        return 'technical_practice', '직무 분야의 지식·기술·업무 절차·현장 대응에 관한 설명을 확인합니다.'
    for subtype, pattern, reason in [
        ('language_profile', r'(?:영어|중국어).*자기소개|자기소개.*(?:영어|중국어)|본인소개.*영어', '질문 내용은 자기소개이며 답변 언어는 별도의 수행 조건입니다. 외국어라는 이유로 직무 지식 질문으로 분류하지 않습니다.'),
        ('emotion_regulation', r'스트레스|외로|우울|감정|화가|화를|화날|화났|분노|긴장.*(?:극복|해소|조절)|조절.*감정', '감정·스트레스를 인식하고 조절한 방법과 자기 관리 태도를 확인합니다.'),
        ('ethics', r'청렴|정직|공정|부당|뇌물|청탁|비리|윤리|성인지|성평등|성차별|혐오|인권|성희롱|갑질|위법|법.*어긴|탕비실', '공직자로서의 윤리·공정성과 타인의 권리를 존중하는 판단·실천 기준을 확인합니다.'),
        ('strength_evidence', r'장점|강점|뛰어난|잘할 수|잘하는|잘 할 수|자랑|기여할', '본인의 강점·기여 가능성과 이를 보여 주는 근거·사례를 확인합니다.'),
        ('responsibility', r'실수|잘못|책임감|책임|성실|일을.*(?:미루|떠넘)|지각|마감', '자신의 역할과 잘못에 책임지고 맡은 일을 신뢰성 있게 수행하는 태도를 확인합니다.'),
        ('interpersonal_judgement', r'갈등|협업|협동|팀|동료|상사|선임|후임|선배|후배|소통|설득|대인|인간관계|리더|팔로워|상황|라면|한다면|경우|어떻게.*(?:하겠|할)', '관계 조정·협업·조직 내 역할과 상황에서의 판단·행동 기준을 확인합니다.'),
        ('experience', r'경험|한 적|했던|겪|살면서|성취|실패|노력|보람|배운|배웠|극복', '지원자 자신의 경험·행동·대처 과정과 배운 점을 확인합니다.'),
        ('values_fit', r'지원|동기|포부|공직|가치|덕목|사명|헌신|10년|되고 싶|되고싶|하고 싶|하고싶|왜|이유', '지원 이유·공직 가치·진로·업무 적합성과 본인의 입장을 확인합니다.'),
    ]:
        if re.search(pattern, text):
            return subtype, reason
    return 'profile', '지원자에 대한 자기 설명·이력·성향·관점 또는 면접 진행 문맥을 확인합니다.'


def answer_type(row):
    text = row['source_prompt']
    if row['classification_status'] == 'needs_context':
        return 'context'
    if 'context_needed' in row['flags']:
        return 'followup'
    if row['assessment_parts']:
        return 'mixed'
    if 'rapport' in row['flags']:
        return 'rapport'
    if row['subtype'] in ('profile', 'language_profile'):
        return 'profile'
    if row['subtype'] in ('social_opinion', 'policy_opinion'):
        return 'opinion'
    if row['category'] == 'job':
        if 'language_performance' in row['flags'] or re.search(r'시연|역할극|연기해', text):
            return 'practical'
        if re.search(r'(?:발생|상황|때|시|중|경우|한다면|라면).*(?:조치|대처|대응|구조|처리|할 것|하시겠|하겠)|어떻게.*(?:조치|대처|대응|처리|구조)', text):
            return 'job_situation'
        if re.search(r'생각|의견|견해|찬반|찬성|반대|방향|개선', text):
            return 'opinion'
        return 'knowledge'
    if row['subtype'] == 'experience' or re.search(r'경험|한 적|했던|겪|살면서|살아오', text):
        return 'experience'
    if re.search(r'라면|한다면|경우|상황|어떻게.*(?:하겠|할)|할 것인가', text):
        return 'personal_situation'
    return 'value'


def personality_topics(row):
    """Map meaning to existing notebook topics without matching unrelated substrings."""
    subtype, text = row['subtype'], row['source_prompt']
    if subtype in ('profile', 'strength_evidence', 'language_profile'):
        return ['self']
    if subtype == 'emotion_regulation':
        return ['stress']
    if subtype == 'ethics':
        return ['integrity', 'public']
    if subtype == 'responsibility':
        return ['responsibility', 'failure']
    if subtype == 'interpersonal_judgement':
        return ['communication', 'judgement'] + (['leadership'] if re.search(r'리더|팀장|간부|함장|서장', text) else [])
    if subtype == 'values_fit':
        return ['motivation'] if re.search(r'지원|계획|포부|적응|생활|발령|근무|자격|역량|잘.*할|힘들|고립', text) else ['public']
    if subtype == 'social_opinion':
        return ['public', 'judgement']
    return ['self']


def sql_literal(value):
    return "'" + json.dumps(value, ensure_ascii=False).replace("'", "''") + "'::jsonb"


def deployment_sql(changes):
    payload = [{k: r[k] for k in ('question_id', 'source_prompt', 'source_category', 'category', 'topic_ids', 'rationale')} for r in changes]
    return '\n'.join([
        '-- Generated by scripts/reclassify-interview-questions.py. Apply only after final user approval.',
        '-- IDs, prompts, answers and attempt snapshots are preserved. Classification edits can require publication reapproval.',
        'begin;',
        'create temporary table ip_reclassification_input (r jsonb not null) on commit drop;',
        f'insert into ip_reclassification_input select value from jsonb_array_elements({sql_literal(payload)});',
        # Lock only the affected rows, consistently ordered, before checking the snapshot.
        "select q.id from public.ip_questions q join ip_reclassification_input i on q.id=i.r->>'question_id' order by q.id for update of q;",
        'do $$ begin',
        " if exists(select 1 from ip_reclassification_input i left join public.ip_questions q on q.id=i.r->>'question_id'",
        "   where q.id is null or q.prompt is distinct from i.r->>'source_prompt'",
        "     or q.category not in (i.r->>'source_category',i.r->>'category')",
        "     or (q.category=i.r->>'source_category' and q.revision<>1)) then",
        "   raise exception 'classification_snapshot_conflict: refresh the question snapshot before applying';",
        ' end if;',
        'end $$;',
        "insert into public.ip_history(entity,entity_id,actor_id,snapshot)",
        f" select 'question_classification',q.id,'{VERSION}',",
        " jsonb_build_object('before',to_jsonb(q),'category',i.r->>'category','topic_ids',i.r->'topic_ids','rationale',i.r->>'rationale')",
        " from public.ip_questions q join ip_reclassification_input i on q.id=i.r->>'question_id'",
        " where q.category=i.r->>'source_category';",
        'update public.ip_questions q',
        " set category=i.r->>'category',topic_ids=array(select jsonb_array_elements_text(i.r->'topic_ids')),revision=q.revision+1,updated_at=now()",
        " from ip_reclassification_input i where q.id=i.r->>'question_id' and q.category=i.r->>'source_category';",
        '-- Existing category-change triggers invalidate prior rubric/analysis approvals.',
        'commit;',
        '',
    ])


def main():
    corpus_path = OUT / 'interview-corpus.json'
    corpus = read(corpus_path)
    additional = read(ROOT / 'scripts/data/interview-additional-questions.json')['questions']
    questions = [{**q, 'revision': 1} for q in corpus['questions']] + additional
    assert len(questions) == len({q['id'] for q in questions}), 'Duplicate question ID'
    by_id = {q['id']: q for q in questions}
    overrides = read(ROOT / 'scripts/data/interview-classification-overrides.json')['records']
    exact = {r['question_id']: r for r in overrides}
    assert len(exact) == len(overrides), 'Duplicate decision'
    for key, decision in exact.items():
        assert key in by_id, 'Unknown question: ' + key
        q = by_id[key]
        assert (q['prompt'], q['category']) == (decision['source_prompt'], decision['source_category']), 'Stale decision: ' + key
        assert decision['category'] in LABELS and decision.get('subtype', 'profile') in SUBTYPES
    previous = read(ROOT / 'scripts/data/interview-classification-v1-baseline.json')['categories']
    assert all(key in by_id for key in previous), 'Unknown v1 baseline question'
    records = []
    for q in sorted(questions, key=lambda q: q['id']):
        decision = exact.get(q['id'])
        effective_category = decision['category'] if decision else q['category']
        subtype, rationale = infer_subtype({**q, 'category': effective_category})
        row = {'question_id': q['id'], 'source_prompt': q['prompt'], 'source_category': q['category'],
               'source_revision': q['revision'], 'category': effective_category, 'subtype': subtype,
               'secondary_category': None, 'rationale': rationale, 'method': 'intent-family-v2',
               'classification_status': 'classified', 'previous_category': previous.get(q['id'], q['category'])}
        if decision:
            row.update({k: v for k, v in decision.items() if k not in ('confirm_intent_family', 'context_needed', 'rapport', 'sensitive_review')})
            row['method'] = 'exact-question-reading-v2'
        if decision and decision.get('rapport'):
            row.update(subtype='rapport', rationale='안부·대기·진행·현재 소감을 묻는 질문입니다. 직무 지식이나 인성 역량의 증거를 직접 요구하는 질문과 분리합니다.')
        row['changed'] = row['category'] != row['source_category']
        row['changed_from_previous'] = row['category'] != row['previous_category']
        row['resolved_category'] = row['category'] if row['classification_status'] == 'classified' else None
        row.setdefault('assessment_parts', [])
        last_end = 0
        for part in row['assessment_parts']:
            at = row['source_prompt'].find(part['quote'], last_end)
            assert at >= 0 and part['category'] in LABELS, 'Invalid assessment quote'
            last_end = at + len(part['quote'])
        assert not row['changed'] or row['classification_status'] == 'classified', 'Unresolved category cannot be deployed'
        row['flags'] = []
        text = q['prompt']
        if re.search(r'영어|중국어|일본어|SMCP|해사영어', text):
            performance = re.search(r'영어로|중국어로|일본어로|(?:영어|중국어|일본어).*(?:소개|답변|지시|말해|시연|해보|해 보|로 편한)|(?:자기소개|홍보).*(?:영어|중국어|일본어)', text)
            row['flags'].append('language_performance' if performance else 'language_background')
        if decision and decision.get('context_needed'):
            row['flags'].append('context_needed')
        if decision and decision.get('rapport'):
            row['flags'].append('rapport')
        if decision and decision.get('sensitive_review'):
            row['flags'].append('sensitive_review')
        if decision and decision.get('source_answer_mismatch'):
            row['flags'].append('source_answer_mismatch')
        if row['secondary_category']:
            row['flags'].append('mixed_intent')
        row['standalone_candidate'] = not any(f in row['flags'] for f in ('context_needed', 'rapport', 'sensitive_review'))
        row['answer_type'] = answer_type(row)
        row['requires_open_ended_rubric'] = row['answer_type'] != 'knowledge'
        row['evidence'] = {'quote': text, 'basis': 'question_reading' if decision else 'reviewed_intent_family'}
        if row['category'] == 'job':
            row['topic_ids'] = []
        elif row['changed']:
            row['topic_ids'] = personality_topics(row)
        else:
            row['topic_ids'] = q.get('topic_ids', [])
        records.append(row)
    groups = collections.defaultdict(set)
    for row in records:
        key = re.sub(r'[^가-힣A-Za-z0-9]', '', unicodedata.normalize('NFKC', row['source_prompt'])).lower()
        if key:
            groups[key].add(row['category'])
    assert all(len(categories) == 1 for categories in groups.values()), 'Identical wording has conflicting categories'
    changes = [r for r in records if r['changed']]
    report = {'version': VERSION, 'questions': len(records), 'imported_questions': len(corpus['questions']),
              'additional_questions': len(additional),
              'source_sha256': hashlib.sha256(corpus_path.read_bytes()).hexdigest(),
              'before': dict(collections.Counter(r['source_category'] for r in records)),
              'after': dict(collections.Counter(r['category'] for r in records)),
              'changes': len(changes),
              'transitions': dict(collections.Counter(r['source_category'] + '→' + r['category'] for r in changes)),
              'methods': dict(collections.Counter(r['method'] for r in records)),
              'changed_from_previous': sum(r['changed_from_previous'] for r in records),
              'classification_status': dict(collections.Counter(r['classification_status'] for r in records)),
              'resolved_categories': dict(collections.Counter(r['category'] for r in records if r['classification_status'] == 'classified')),
              'pending_original_categories': dict(collections.Counter(r['source_category'] for r in records if r['classification_status'] == 'needs_context')),
              'answer_types': dict(collections.Counter(r['answer_type'] for r in records)),
              'questions_with_assessment_parts': sum(bool(r['assessment_parts']) for r in records),
              'subtypes': dict(collections.Counter(r['subtype'] for r in records)),
              'flags': dict(collections.Counter(f for r in records for f in r['flags'])),
              'production_applied': False, 'published': False}
    write(OUT / 'interview-question-classification.json', {'report': report, 'records': records})
    write(OUT / 'interview-question-classification-report.json', report)
    (OUT / 'interview-question-classification.sql').write_text(deployment_sql(changes), encoding='utf-8')
    review_dir = ROOT / 'artifacts/interview-classification'
    review_dir.mkdir(parents=True, exist_ok=True)
    for name, rows in [('all-questions', records), ('category-changes', changes),
                       ('changes-from-v1', [r for r in records if r['changed_from_previous']]),
                       ('classification-pending', [r for r in records if r['classification_status'] == 'needs_context']),
                       ('context-review', [r for r in records if not r['standalone_candidate']])]:
        with (review_dir / (name + '.csv')).open('w', encoding='utf-8-sig', newline='') as file:
            writer = csv.writer(file)
            writer.writerow(['질문 ID', '질문', '원본 분류', '1차 분류안', '2차 분류안', '확정 여부', '세부 분류', '보조 분류', '답변 유형', '복합 질문의 개별 요구', '근거', '유의 사항', '검토 방식'])
            for r in rows:
                writer.writerow([r['question_id'], r['source_prompt'], LABELS[r['source_category']], LABELS[r['previous_category']], LABELS[r['resolved_category']] if r['resolved_category'] else '분류 보류',
                                 '문맥 확인 전 보류' if r['classification_status'] == 'needs_context' else '분류안',
                                 SUBTYPES[r['subtype']], LABELS.get(r['secondary_category'], ''), r['answer_type'],
                                 ' / '.join(LABELS[p['category']] + ': ' + p['quote'] for p in r['assessment_parts']), r['rationale'],
                                 ', '.join(r['flags']), r['method']])
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
