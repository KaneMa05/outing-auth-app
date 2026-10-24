"""Import the supplied HWP's actual 25 main topics and 22 appendix questions.

The title '30제' is retained as the collection name, never fabricated as a count.
Source commentary and related-question lists stay in admin-only occurrences.
Usage: python import-interview-core30.py INPUT.hwp [olefile module directory]
"""
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
if len(sys.argv)>2:
    sys.path.insert(0,str(Path(sys.argv[2]).resolve()))
spec=importlib.util.spec_from_file_location("hwp_reader",ROOT/"scripts/read-interview-hwp.py")
reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)

# Per-question interpretation after reading the source's main/related questions
# and teaching intent. These are preparation drafts, not official scoring rules.
MAIN=[
 ("strength-evidence career-fit preparation-learning","profile","강점의 이름보다 실제 행동과 결과, 희망 업무에 적용할 수 있는 근거를 확인합니다."),
 ("shared-goal commitment-boundary mutual-support","experience","공동 목표를 위해 감수한 부담과 본인의 기여를 구분합니다. 무제한 희생을 정답으로 요구하지 않습니다."),
 ("weakness-change feedback-change","experience","단점을 알아차린 계기와 개선 행동, 아직 남은 한계를 확인합니다."),
 ("public-mission fairness-integrity initiative","value","공직의 문제를 일반화하지 않고 근거와 개선 방안을 제시하는지 확인합니다. 법령·제도 내용은 별도 최신 검토가 필요합니다."),
 ("shared-goal duty-reliability self-awareness","experience","동아리의 이름보다 실제 역할·활동·기여를 확인합니다. 동아리가 없으면 다른 단체 활동 경험을 활용합니다."),
 ("conflict-mediation listening-empathy emotion-regulation","experience","당사자의 다른 입장, 경청과 중재 행동, 해결 결과를 확인합니다. 미해결 사례도 원인과 배운 점을 설명할 수 있습니다."),
 ("motivation-origin commitment-boundary career-fit","value","어려운 근무 조건을 알고도 지원한 이유와 현실적인 적응 계획을 확인합니다. 건강·소득 내역의 필수 수집으로 바꾸지 않습니다."),
 ("self-awareness strength-evidence feedback-change","experience","타인의 평가를 실제 행동과 연결하고, 자기평가와의 차이 및 조언을 반영한 과정을 확인합니다."),
 ("unjust-direction followership judgement-priority","situation","지시의 사실과 정당성을 확인하고 의견 전달·대안·보고 순서를 구분하는지 확인합니다."),
 ("emotion-regulation resilience","experience","스트레스를 알아차리는 신호, 실제 조절·회복 방법, 지원 요청 시점을 확인합니다. 사적인 고통의 공개를 강요하지 않습니다."),
 ("initiative goal-persistence","experience","문제 발견에서 제안·설득·실행·효과 확인까지 본인이 한 일을 구분합니다."),
 ("career-fit preparation-learning","value","장기 희망을 현재의 준비와 단계별 성장 계획에 연결합니다. 직위나 계급만으로 계획을 평가하지 않습니다."),
 ("respect-inclusion rights-protection","value","성별 고정관념을 돌아보고 존중·권리 보호를 행동으로 설명하는지 확인합니다. 개인의 피해 경험을 필수로 요구하지 않습니다."),
 ("self-awareness strength-evidence motivation-origin","profile","앞서 말한 내용과 일관된 강점·지원 의지를 간결한 근거로 마무리하는지 확인합니다."),
 ("failure-learning feedback-change resilience","experience","실패 원인 중 자신의 몫, 배운 점과 이후 바꾼 행동을 연결합니다."),
 ("emotion-regulation listening-empathy","experience","화를 참는지 내는지의 양자택일보다 감정 인식·표현·관계 회복 행동을 확인합니다."),
 ("listening-empathy initiative public-mission","mixed","대국민 소통의 대상과 필요, 전달 내용과 방법, 효과 확인 방안을 분석합니다. 현재 홍보 정책의 사실은 별도 검토합니다."),
 ("organization-adaptation duty-reliability preparation-learning","situation","예상과 다른 업무의 목적을 파악하고 필요한 역량을 배우며 책임 있게 수행할 방법을 확인합니다."),
 ("judgement-priority problem-response duty-reliability","mixed","사고 원인을 단정하지 않고 근거·예방 행동·역할을 구분하는지 확인합니다. 통계·법령·전문 대응은 직무 학습과 구별합니다."),
 ("values-origin self-awareness preparation-learning","profile","작품 줄거리보다 인상 깊은 지점, 본인의 생각과 이후 행동의 연결을 확인합니다."),
 ("leadership-action mutual-support duty-reliability","experience","리더의 직책보다 의사결정·역할 배분·구성원 지원·결과 책임을 확인합니다."),
 ("judgement-priority fairness-integrity","value","과정과 결과가 충돌할 때 기준과 한계를 설명하는지 확인합니다. 한쪽을 무조건 포기하는 답을 강요하지 않습니다."),
 ("values-origin preparation-learning","value","유명세보다 존경하는 구체적 행동과 본인이 실천한 변화를 확인합니다."),
 ("shared-goal mutual-support listening-empathy","value","팀워크의 조건을 말하는 데서 끝나지 않고 실제 역할 분담·소통·지원 사례로 뒷받침하는지 확인합니다."),
 ("public-mission duty-reliability emotion-regulation judgement-priority","value","음주 문제를 공적 신뢰·자기 관리·안전과 연결해 판단하는지 확인합니다. 법률 해설과 개인 음주 내역은 필수 개인 소재와 분리합니다."),
]
APPENDIX=[
 ("honesty fairness-integrity","공유할 수 있는 범위를 확인하고 친구와 규칙 사이에서 정직하게 설명하는 판단을 봅니다."),
 ("duty-reliability commitment-boundary","가족 돌봄과 업무 공백을 함께 고려해 보고·인계·지원 요청을 계획하는지 봅니다."),
 ("motivation-origin listening-empathy career-fit","가족의 우려를 듣고 지원 이유와 현실적인 계획을 설명하는지 봅니다. 실제 가족 정보는 필요하지 않습니다."),
 ("conflict-mediation emotion-regulation","감정적 대립을 피하며 구체적 문제와 대안을 설명하는 과정을 봅니다."),
 ("respect-inclusion rights-protection","외모 평가가 상대에게 미치는 영향을 이해하고 존중하는 표현으로 전환할 행동을 봅니다."),
 ("leadership-action fairness-integrity mutual-support","업무 분담의 기준, 설명과 조율, 리더의 책임을 봅니다."),
 ("problem-response initiative judgement-priority","행사의 목적과 제약을 확인하고 우선순위·대안·지원 요청을 정하는 과정을 봅니다."),
 ("followership conflict-mediation judgement-priority","기기 문제의 근거와 대안을 제시하고 안전 관련 이견을 책임 있게 전달하는 과정을 봅니다."),
 ("duty-reliability mutual-support conflict-mediation","업무 공백 대응과 지연 사유 확인, 재발 방지 조율을 구분해 봅니다."),
 ("fairness-integrity honesty","누가 어떤 경위로 준 물품인지 확인하고 기준에 따라 판단하는지 봅니다. 과거 전력만으로 현재 행위를 단정하지 않습니다."),
 ("commitment-boundary judgement-priority","업무의 시급성과 본인의 여건을 확인해 협력 범위와 반복 업무의 조정 방법을 설명하는지 봅니다."),
 ("mutual-support commitment-boundary","지원 필요와 각자의 책임을 확인하고 도움 범위·업무 분담을 조율하는지 봅니다."),
 ("fairness-integrity honesty","친분과 공적 기준을 구분하고 확인된 사실에 근거해 책임 있게 대응하는지 봅니다."),
 ("fairness-integrity unjust-direction","비리의 사실을 확인하고 적절한 보고·보호 절차를 고려하는지 봅니다. 원문의 대응 예시는 정답으로 자동 공개하지 않습니다."),
 ("mutual-support duty-reliability listening-empathy","지원 요청의 필요를 설명하고 상대의 부담과 자율성을 확인하는지 봅니다."),
 ("failure-learning rights-protection honesty","자신의 행동을 사실대로 돌아보고 상대의 권리와 공식 절차를 존중하는지 봅니다."),
 ("judgement-priority followership problem-response","즉각적인 위험과 안전 기준을 확인하고 근거·대안·지원 요청을 전달하는지 봅니다."),
 ("conflict-mediation fairness-integrity listening-empathy","어민과 관광객의 입장 및 사실·기준을 함께 확인하고 조정 가능한 대안을 검토하는지 봅니다."),
 ("rights-protection problem-response judgement-priority","현장의 안전과 권리, 본인 권한의 한계와 지원 요청을 구분하는지 봅니다. 난민·단속 절차는 별도의 전문 지식 검토 대상입니다."),
 ("judgement-priority duty-reliability","신속성과 안전·규칙이 충돌할 때 위험을 줄이는 대안과 연락 방법을 제시하는지 봅니다."),
 ("judgement-priority honesty duty-reliability","본인의 상태를 사실대로 알리고 안전한 이동·대체 역할을 요청하는지 봅니다. 실제 음주 경험을 입력하도록 요구하지 않습니다."),
 ("weakness-change feedback-change mutual-support","동료 부담을 인정하고 부족한 역량의 확인·학습·업무 조율을 실행하는지 봅니다."),
]

def main():
    path=Path(sys.argv[1]);paragraphs=reader.extract(path)
    starts=[i for i,p in enumerate(paragraphs) if re.fullmatch(r"Sub\.\d+",p["text"])]
    numbers=[int(paragraphs[i]["text"].split(".")[1]) for i in starts]
    if numbers!=list(range(1,26)):raise ValueError("Source main numbering changed; review before import")
    add=next(i for i,p in enumerate(paragraphs) if p["text"]=="Add.")
    # Appendix question headings are followed by A1/A.1, not by another lesson.
    extra=[i for i in range(add+1,len(paragraphs)-1)
           if re.match(r"^A\.?1[. ]",paragraphs[i+1]["text"]) and not re.match(r"^A",paragraphs[i]["text"])
           and len(paragraphs[i]["text"])<200]
    if len(extra)!=22:raise ValueError(f"Expected 22 appendix questions, found {len(extra)}")
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    source=dict(id="src-"+digest[:24],filename=path.name,sha256=digest,track="공통")
    corpus=json.loads((ROOT/"supabase/seeds/interview-corpus.json").read_text(encoding="utf8"))
    existing={q["id"]:q for q in corpus["questions"]}
    elements=json.loads((ROOT/"supabase/seeds/interview-personality-analysis.json").read_text(encoding="utf8"))["elements"]
    topic_by_element={e["id"]:e["topic_id"] for e in elements}
    questions,occurrences,items,analyses=[],[],[],[]
    for kind,indexes,specs in [("main",starts,MAIN),("appendix",extra,APPENDIX)]:
        for n,(index,specification) in enumerate(zip(indexes,specs),1):
            p=paragraphs[index+1] if kind=="main" else paragraphs[index]
            prompt=p["text"]
            element_ids=specification[0].split()
            topic_ids=list(dict.fromkeys(topic_by_element[e] for e in element_ids))
            form=specification[1] if kind=="main" else "situation"
            rationale=specification[2] if kind=="main" else specification[1]
            qid="q-"+hashlib.sha256(("personality:"+re.sub(r"\s+"," ",prompt).strip()).encode()).hexdigest()[:24]
            questions.append(dict(id=qid,prompt=prompt,category="personality",topic_ids=topic_ids,tracks=[],status="draft",
                                  revision=1,created_at="2026-10-20T00:00:00Z",updated_at="2026-10-20T00:00:00Z"))
            end=(starts[n] if n<len(starts) else add) if kind=="main" else (extra[n] if n<len(extra) else len(paragraphs))
            answer="\n".join(x["text"] for x in paragraphs[index+2 if kind=="main" else index+1:end])
            occurrences.append(dict(id=f"{source['id']}-{kind}-{n}",source_id=source["id"],question_id=qid,
                number=f"Sub.{n}" if kind=="main" else f"Add.{n}",year=2026,region="",section_title=f"핵심인성 30제 · {'핵심 주제' if kind=='main' else '추가 상황형'}",
                locator=f"{p['stream']}:record-offset:{p['offset']}",original_prompt=prompt,answer=answer))
            items.append(dict(collection_id="core-personality-30",question_id=qid,kind=kind,position=n,
                              element_ids=element_ids,analysis_note=rationale))
            analyses.append(dict(question_id=qid,source_prompt=prompt,source_category="personality",element_ids=element_ids,
                evidence=[dict(element_id=e,quote=prompt,basis="핵심인성 교재의 질문·지도 취지 해석",interpretation=rationale) for e in element_ids],
                disposition="personal",flags=["knowledge_component"] if (kind=="main" and n in [4,17,19,25]) or(kind=="appendix" and n==19) else [],
                answer_form=form,rationale=rationale,status="draft",revision=1,method="core30-source-analysis-v1",reviewer="",reviewed_at=None))
    # Associated question lists/commentary are preserved under each original source,
    # not promoted into extra core-numbered questions or shown as student answers.
    collection=dict(id="core-personality-30",title="핵심인성 30제",
                    description="제공 교재의 제목입니다. 실제 본문은 핵심 주제 25개와 추가 상황형 22개로 구성되어 있습니다.")
    report=dict(filename=path.name,sha256=digest,main_topics=25,appendix_questions=22,
                items=len(items),existing_exact_questions=sum(q["id"] in existing for q in questions),
                new_questions=sum(q["id"] not in existing for q in questions),elements=sorted(set(e for i in items for e in i["element_ids"])),
                related_questions="원문 연관 기출·해설은 각 주제의 관리자 출처에 보존; 핵심 번호로 중복 생성하지 않음",
                published=0,reviewed=0)
    out=ROOT/"supabase/seeds"
    (out/"interview-core30.json").write_text(json.dumps(dict(report=report,collection=collection,source=source,questions=questions,
        occurrences=occurrences,items=items,analyses=analyses),ensure_ascii=False,indent=2),encoding="utf8")
    sql=["-- User-supplied HWP. Drafts only; preserves previously edited questions and analyses.","begin;"]
    def literal(v):return "'"+json.dumps(v,ensure_ascii=False).replace("'","''")+"'::jsonb"
    for table,rows,pk in [
        ("ip_sources",[source],"id"),("ip_questions",questions,"id"),("ip_occurrences",occurrences,"id"),
        ("ip_collections",[collection],"id"),("ip_collection_items",items,"collection_id,question_id"),
        ("ip_question_analysis",analyses,"question_id")]:
        sql.append(f"insert into public.{table} select * from jsonb_populate_recordset(null::public.{table}, {literal(rows)}) on conflict ({pk}) do nothing;")
    sql.append("commit;")
    (out/"interview-core30.sql").write_text("\n".join(sql)+"\n",encoding="utf8")
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
