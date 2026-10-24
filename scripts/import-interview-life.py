"""Import the 30 worksheet prompts, never sample applicants' answers.
Usage: python scripts/import-interview-life.py INPUT.hwp [olefile module directory]
Uses the read-only HWP reader in this directory. Outputs a reviewed catalog seed.
"""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

if len(sys.argv) > 2:
    sys.path.insert(0, str(Path(sys.argv[2]).resolve()))
spec = importlib.util.spec_from_file_location("hwp_reader", Path(__file__).with_name("read-interview-hwp.py"))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)
source = Path(sys.argv[1])
paragraphs = reader.extract(source)
sha = hashlib.sha256(source.read_bytes()).hexdigest()
# Original 30 competencies stay separate; mappings are preparation aids, not equivalence.
rows = [
    (145, "갈등관리", ["conflict-mediation", "listening-empathy"]),
    (149, "계획력", ["goal-persistence", "problem-response"]),
    (153, "국민지향성", ["service-action", "listening-empathy"]),
    (156, "기획력", ["initiative", "shared-goal"]),
    (162, "도전정신", ["initiative", "goal-persistence"]),
    (166, "리더십", ["leadership-action"]),
    (169, "문제해결력", ["problem-response"]),
    (173, "분석력", ["problem-response", "judgement-priority"]),
    (176, "설득력", ["conflict-mediation"]),
    (182, "목표달성능력", ["goal-persistence"]),
    (185, "수리감각 및 수익성", ["judgement-priority", "duty-reliability"]),
    (188, "의사결정 판단능력", ["judgement-priority", "problem-response"]),
    (191, "자기계발", ["feedback-change", "preparation-learning"]),
    (194, "적응력", ["organization-adaptation"]),
    (197, "전략적 사고력", ["judgement-priority", "problem-response"]),
    (203, "정보수집능력", ["preparation-learning", "problem-response"]),
    (207, "정직·윤리의식", ["honesty", "fairness-integrity"]),
    (211, "주도적·적극성", ["initiative"]),
    (215, "창의력", ["initiative", "problem-response"]),
    (219, "책임감", ["duty-reliability", "honesty"]),
    (226, "체계적인 사고", ["problem-response", "judgement-priority"]),
    (230, "추진력", ["initiative", "goal-persistence"]),
    (234, "치밀성", ["duty-reliability", "problem-response"]),
    (238, "커뮤니케이션 능력", ["listening-empathy", "conflict-mediation"]),
    (242, "팀워크", ["shared-goal", "mutual-support", "followership"]),
    (246, "혁신 사고력", ["initiative", "problem-response"]),
    (253, "성인지감수성", ["respect-inclusion", "rights-protection"]),
    (258, "예의 품행", ["respect-inclusion", "emotion-regulation"]),
    (263, "성실성", ["duty-reliability", "goal-persistence"]),
    (268, "사회적 가치판단", ["public-mission", "service-action", "fairness-integrity"]),
]
assert len(paragraphs) == 273, "Source changed: review paragraph mapping before import"
elements = {e["id"] for e in json.loads(Path("supabase/seeds/interview-personality-analysis.json").read_text(encoding="utf-8"))["elements"]}
catalog = []
for i, (start, title, mapping) in enumerate(rows):
    end = rows[i + 1][0] if i + 1 < len(rows) else len(paragraphs)
    definition_index = start + (2 if i + 1 in (5, 7) else 1)
    questions = [p["text"] for p in paragraphs[definition_index + 1:end] if p["text"].startswith("Q.")]
    assert questions and set(mapping) <= elements
    catalog.append(dict(id=f"life-{i+1:02}", position=i+1, title=title,
                        definition=paragraphs[definition_index]["text"], questions=questions, element_ids=mapping,
                        source=dict(filename=source.name, sha256=sha, stream=paragraphs[start]["stream"],
                                    offset=paragraphs[start]["offset"], paragraph=start+1)))
data = dict(source=dict(filename=source.name, sha256=sha), competencies=catalog,
            note="원본 5개 입력 영역 및 30개 액션 지표. 예시 개인 이력·답변은 시드에 넣지 않음. 기존 인성 요소 연결은 준비용 해석이며 동등성·공식 평가표를 의미하지 않음.")
Path("supabase/seeds/interview-life-catalog.json").write_text(json.dumps(data, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
def sql(value):
    return "'" + value.replace("'", "''") + "'"
lines = ["begin;"]
for c in catalog:
    lines.append("insert into public.ip_life_competencies(id,position,title,definition,questions,element_ids,source) values (" +
                 ",".join([sql(c["id"]), str(c["position"]), sql(c["title"]), sql(c["definition"]),
                           "array["+",".join(map(sql,c["questions"]))+"]",
                           "array["+",".join(map(sql,c["element_ids"]))+"]",
                           sql(json.dumps(c["source"],ensure_ascii=False))+"::jsonb"])+" ) on conflict(id) do nothing;")
lines.append("commit;")
Path("supabase/seeds/interview-life-catalog.sql").write_text("\n".join(lines)+"\n", encoding="utf-8")
print(f"Imported {len(catalog)} competencies and {sum(len(c['questions']) for c in catalog)} prompts. No student answers imported.")
