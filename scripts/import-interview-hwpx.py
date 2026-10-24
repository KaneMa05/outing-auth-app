"""Deterministic HWPX import. No network/AI, originals and source answers preserved.
Usage: python scripts/import-interview-hwpx.py <directory>
Outputs are private deployment inputs under supabase/seeds (never browser assets).
Classification is a RULE SUGGESTION; every imported question starts as a draft.
"""
import sys, re, json, hashlib, zipfile, collections
import xml.etree.ElementTree as ET
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
NS = {"hp": "http://www.hancom.co.kr/hwpml/2011/paragraph"}
RULES = {
    "motivation": r"지원.*동기|지원.*이유|왜.*해양경찰|입직|포부|해양경찰.*(?:적합|준비|잘할|하고 싶)|합격.*(?:한다면|하면)|시험.*응시",
    "self": r"자기소개|자기자랑|(?:본인|자신|성격|나의).*(?:장점|단점|강점|약점|평가)|좌우명|MBTI|취미|특기|성격|습관|존경|성장 과정|성장과정|마지막.*(?:말|싶)|인생|자신.*표현|본인.*표현",
    "teamwork": r"협동|협업|팀워크|협력|협조|단체|공동.*목표|팀.*목표|팀 업무|팀원.*어울",
    "communication": r"갈등|의견.*다|소통|설득|오해|다툼|대인관계|인간관계|대화|의견.*충돌|반대.*성향|경청|잔소리",
    "leadership": r"리더|팔로워|리더십|조장|팀장",
    "achievement": r"성취|성과|목표|성공|도전|끈기|노력.*경험|가장.*(?:열심|뿌듯|보람)|주도적|열정",
    "failure": r"실패|실수|부족|피드백|극복|개선|충고|조언|후회|반성|보완|잘못|단점|포기",
    "responsibility": r"책임|희생|손해.*감수|끝까지|맡은.*일|성실|의무|헌신|당직",
    "service": r"봉사|배려|타인.*도|도움|약자|공익|양보|타인.*위해|남을.*위해",
    "integrity": r"청렴|정직|금품|부정|부당|공정|원칙|윤리|식사 대접|뇌물|청탁|접대|눈감|위법|사적|사익|거짓|탕비실|차별|비리",
    "public": r"공직|국가관|사명|헌법|공무원|공조직|사조직|가치관|덕목|경찰.*가치|국민.*(?:신뢰|봉사)|국가.*국민",
    "stress": r"스트레스|감정|배신|힘들|인내|화가|화를|분노|흥분|자제력|이성을 잃",
    "judgement": r"어떻게.*(?:대응|대처|처리|조치|해결|하겠|하시겠|말하겠|할 것)|(?:상황|라면|경우|하면).*(?:하겠|대응|대처|행동)|우선순위|위기|긴급",
}

def paragraphs(path):
    with zipfile.ZipFile(path) as z:
        for section in sorted(n for n in z.namelist() if re.fullmatch(r"Contents/section\d+\.xml", n)):
            root = ET.fromstring(z.read(section))
            for i, p in enumerate(root.findall(".//hp:p", NS)):
                text = "".join("".join(t.itertext()) for run in p.findall("hp:run", NS)
                               for t in run.findall("hp:t", NS)).strip()
                if text:
                    yield section, i, text

def main():
    folder = Path(sys.argv[1])
    sources, questions, occurrences = [], {}, []
    headings = collections.Counter()
    for file in sorted(folder.glob("*.hwpx")):
        track = file.stem.split("_")[1]
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        source_id = "src-" + digest[:24]
        sources.append(dict(id=source_id, filename=file.name, sha256=digest, track=track))
        year, region, section_title, current = None, "", "", None
        def flush():
            if current:
                current["answer"] = "\n".join(current.pop("answer_lines"))
                occurrences.append(current.copy())
        for section, index, text in paragraphs(file):
            match = re.match(r"^Q(\d+)[.．]\s*(.+)", text, re.S)
            if match:
                flush()
                prompt = match[2].strip()
                normalized = re.sub(r"\s+", " ", prompt).strip()
                if "직무" in section_title:
                    category = "job"
                elif "인성" in section_title or "사전질문" in section_title:
                    category = "personality"
                else:
                    raise ValueError(f"Unknown category: {file.name} {section_title} {text}")
                # Same wording in two original sections remains distinct by category.
                qid = "q-" + hashlib.sha256((category + ":" + normalized).encode()).hexdigest()[:24]
                tags = ([key for key, pattern in RULES.items() if re.search(pattern, prompt)]
                        or ["unclassified"]) if category == "personality" else []
                if qid not in questions:
                    questions[qid] = dict(id=qid, prompt=prompt, topic_ids=tags,
                                          category=category, tracks=[], status="draft")
                if track not in questions[qid]["tracks"]:
                    questions[qid]["tracks"].append(track)
                current = dict(id=f"{source_id}-{section.split('/')[-1]}-{index}",
                               source_id=source_id, question_id=qid, number=match[1],
                               year=year, region=region, section_title=section_title,
                               locator=f"{section}:paragraph:{index}", original_prompt=text,
                               answer_lines=[])
            elif re.fullmatch(r"(?:19|20)\d{2}년", text):
                flush(); current = None; year = int(text[:4]); region = ""; section_title = ""
            elif text in ["중부", "서해", "남해", "동해", "제주", "본청", "전국"]:
                flush(); current = None; region = text
            elif re.fullmatch(r".*(?:질문|질문지|면접|공통|직무|인성|토론).{0,12}\((?:19|20)\d{2}년\)", text):
                flush(); current = None; section_title = text; headings[text] += 1
                year = int(re.search(r"\d{4}", text)[0]); region = ""
            elif current:
                current["answer_lines"].append(text)
        flush()
    if not sources or not occurrences:
        raise RuntimeError("No questions extracted")
    out = Path("supabase/seeds")
    out.mkdir(parents=True, exist_ok=True)
    data = dict(sources=sources, questions=list(questions.values()), occurrences=occurrences)
    (out / "interview-corpus.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    def literal(value):
        return "'" + json.dumps(value, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    sql = ["-- Generated by scripts/import-interview-hwpx.py. Import drafts, never overwrite reviewed records.", "begin;"]
    for table, rows in [("ip_sources", sources), ("ip_questions", data["questions"]), ("ip_occurrences", occurrences)]:
        for start in range(0, len(rows), 100):
            batch = rows[start:start+100]
            sql.append(f"insert into public.{table} select * from jsonb_populate_recordset(null::public.{table}, {literal(batch)}) on conflict (id) do nothing;")
    sql.append("commit;")
    # Populate recordset fills unspecified columns with NULL, so explicit defaults are supplied.
    for q in data["questions"]:
        q.update(revision=1, created_at="2026-10-20T00:00:00Z", updated_at="2026-10-20T00:00:00Z")
    # Regenerate questions batch with defaults.
    sql = [s for s in sql if not s.startswith("insert into public.ip_questions")]
    question_inserts = []
    for start in range(0, len(data["questions"]), 100):
        question_inserts.append(f"insert into public.ip_questions select * from jsonb_populate_recordset(null::public.ip_questions, {literal(data['questions'][start:start+100])}) on conflict (id) do nothing;")
    sql[2:2] = question_inserts
    (out / "interview-corpus.sql").write_text("\n".join(sql)+"\n", encoding="utf-8")
    report = {
        "files": len(sources), "occurrences": len(occurrences), "unique_exact_questions": len(questions),
        "by_track": dict(collections.Counter(next(s["track"] for s in sources if s["id"] == o["source_id"]) for o in occurrences)),
        "topic_suggestions": dict(collections.Counter(t for q in questions.values() for t in q["topic_ids"])),
        "questions_by_category": dict(collections.Counter(q["category"] for q in questions.values())),
        "occurrences_by_category": dict(collections.Counter(questions[o["question_id"]]["category"] for o in occurrences)),
        "without_year": sum(o["year"] is None for o in occurrences),
        "classification": "keyword-rule suggestions, awaiting admin review",
        "headings": dict(headings),
    }
    (out / "interview-import-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
