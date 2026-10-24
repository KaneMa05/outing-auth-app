"""Build auditable element suggestions, never an official scoring rubric.

Uses question wording only. Source model answers are NOT student experiences.
Every record remains draft until a teacher reviews it. No network or paid AI.
"""
import collections
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "supabase/seeds"
ELEMENTS = []


def element(id, topic, title, intent, materials, checks, pattern):
    ELEMENTS.append(dict(id=id, topic_id=topic, title=title, intent=intent,
                         material_prompts=materials.split("|"),
                         checkpoints=checks.split("|"), pattern=pattern,
                         sort_order=len(ELEMENTS) + 1))


element("self-awareness", "self", "자기이해와 일관성",
        "자신의 특성을 구체적으로 설명하고 자기평가와 실제 행동을 연결하는가.",
        "나를 설명하는 특성 2개|그 특성이 드러난 실제 장면|타인의 평가와 내 생각이 다른 점",
        "추상적 수식어만 나열하지 않는가|사례가 주장한 특성과 연결되는가",
        r"자기소개|자소서|자기자랑|성격|성향|MBTI|mbti|자신.*표현|본인.*표현|자기.*표현|어떤\s*사람|별명|본인에게.*말|마지막.*(?:말|이야기)|마지막으로.*할")
element("strength-evidence", "self", "강점의 근거와 활용",
        "장점이 실제 행동과 결과로 확인되며 조직에서 활용할 수 있는가.",
        "가장 자신 있는 강점|강점을 발휘한 행동과 결과|해양경찰 업무에서 활용할 장면",
        "타인과 비교한 우월감보다 자기 근거가 있는가|직무 연결이 구체적인가",
        r"장점|강점|특기|뽑아야|뽑아야\s*하는|발휘|잘할|잘\s*할|자신있|자신\s*있|칭찬|좋은\s*평가|좋은\s*평판")
element("weakness-change", "self", "약점 인식과 개선",
        "약점을 회피하지 않고 개선 행동과 남은 한계를 설명하는가.",
        "불편을 일으킨 약점|이를 알아차린 계기|개선 행동과 달라진 점",
        "장점을 약점으로 포장하지 않는가|변화 전후가 확인되는가",
        r"단점|약점|안좋은\s*습관|안\s*좋은\s*습관|나쁜\s*습관|못하는\s*일|고쳐야|보완")
element("values-origin", "self", "가치관의 형성",
        "자신의 기준이 어떤 경험에서 생겼고 실제 선택에 어떻게 작용하는가.",
        "중요하게 여기는 가치|그 가치가 생긴 계기|그 기준으로 내린 실제 선택",
        "유명인의 말만 인용하지 않는가|가치와 행동이 모순되지 않는가",
        r"좌우명|존경|본받|닮고\s*싶|성장\s*과정|가치관|인생관|읽은\s*책|읽었던\s*책|감명|기억에.*(?:책|도서)|행복|소중|아끼는|인생")
element("motivation-origin", "motivation", "지원 계기와 선택 이유",
        "지원 이유가 본인의 경험에 근거하고 다른 진로와 구별되는가.",
        "관심이 생긴 구체적 계기|다른 직업 대신 선택한 이유|전직·하선 등 경력 전환 이유",
        "막연한 안정성만 제시하지 않는가|실제 계기와 선택이 연결되는가",
        r"지원\s*동기|지원.*(?:계기|이유)|왜.*(?:지원|해경|해양경찰)|(?:왜|이유).*(?:그만|하선|전향)|(?:그만|하선|전향).*이유|되어야\s*하는\s*이유")
element("career-fit", "motivation", "조직 이해와 진로 계획",
        "희망 업무와 현실적인 근무 조건을 이해하고 기여 계획을 제시하는가.",
        "희망 업무와 이유|희망과 다른 배치에 대한 생각|입직 후 배우고 기여할 계획",
        "기관 이미지와 실제 업무를 구분하는가|배치가 달라도 기여 방안을 설명하는가",
        r"포부|입직|가고\s*싶|어떤\s*부서|희망.*(?:부서|업무)|10년|십\s*년|어떤\s*해양경찰|어떤\s*해경|기여|직무수행계획|해경.*계획|해양경찰.*계획|해경.*매력|관제.*매력|들어와서.*다르|업무가.*다르")
element("preparation-learning", "motivation", "준비의 실행과 전문성 성장",
        "필요한 역량을 파악하고 실제 학습·훈련으로 준비했는가.",
        "준비가 필요했던 역량|실제로 한 학습·훈련|배운 내용을 적용한 사례와 다음 계획",
        "자격증 이름만 나열하지 않는가|준비 과정의 행동과 적용이 드러나는가",
        r"준비|자격증|전문성|공부|훈련|배운|전공|(?:직무|관제사).*노력|경험.*(?:적용|살릴)|실무.*살릴")
element("shared-goal", "teamwork", "공동 목표와 역할 수행",
        "팀 목표를 이해하고 본인 역할로 공동 결과에 기여했는가.",
        "공동 목표와 팀 구성|본인의 책임 범위|실제 기여와 팀의 결과",
        "팀 성과와 본인의 기여를 구분하는가|역할·행동·결과가 연결되는가",
        r"협동|협업|협력|팀워크|공동.*목표|단체.*(?:활동|성과|목표)|팀.*(?:과제|활동|성과|목표)|조별")
element("mutual-support", "teamwork", "동료 지원과 업무 조율",
        "협력이 필요한 시점을 판단하고 지원·분담을 조율하는가.",
        "동료가 어려움을 겪었던 상황|지원하거나 도움을 요청한 행동|분담의 공정성과 업무 결과",
        "일을 모두 떠안는 것을 협력으로만 설명하지 않는가|역할과 한계를 조율했는가",
        r"협조|동료.*(?:돕|도움|지원|업무|넘긴)|업무.*(?:부탁|분담)|무임승차|팀원.*(?:돕|지원|어울)|조직.*중요")
element("listening-empathy", "communication", "경청과 관점 이해",
        "상대의 입장과 필요를 확인하고 자신의 추측과 구분하는가.",
        "상대가 원한 것|상대를 이해하기 위해 한 질문|내 판단이 달라진 부분",
        "경청했다는 말 대신 실제 확인 행동이 있는가|상대 관점을 왜곡하지 않는가",
        r"경청|공감|소통|의사소통|고민상담|대화|친화력|인간관계|대인관계")
element("conflict-mediation", "communication", "갈등 조정과 설득",
        "쟁점을 분리하고 공통 기준과 대안으로 의견 차이를 해결하는가.",
        "갈등 당사자들의 다른 입장|내가 제안한 기준과 대안|합의 또는 미해결 결과와 후속 행동",
        "누가 옳은지만 설명하지 않는가|실제 조정 과정과 한계를 인정하는가",
        r"갈등|충돌|설득|다툼|오해|의견.*(?:다|차이|모|맞|대립)|반대.*(?:의견|성향)|불화|층간\s*소음")
element("leadership-action", "leadership", "리더의 판단과 구성원 지원",
        "방향을 제시하고 역할·참여·결과에 책임지는가.",
        "리더를 맡은 상황|판단과 역할 배분|구성원을 지원한 행동과 결과",
        "직책만으로 리더십을 주장하지 않는가|구성원의 참여와 본인 책임이 보이는가",
        r"리더|리더십|조장|팀장|이끌|통솔|지휘")
element("followership", "leadership", "팔로워십과 건설적 의견 제시",
        "역할을 존중하며 필요한 의견을 근거 있게 전달하는가.",
        "지시·결정과 내 생각이 달랐던 일|의견을 전달한 방식|결정 이후 맡은 역할",
        "무조건 복종과 독단적 거부로 단순화하지 않는가|권한과 책임의 범위를 이해하는가",
        r"팔로워|팔로우|복종|상명하복|상사.*의견|계급.*(?:근무|생활)|순경.*(?:근무|생활)")
element("goal-persistence", "achievement", "목표 설정과 지속 실행",
        "목표를 세우고 어려움 속에서도 계획을 실행·조정하는가.",
        "목표를 정한 이유|가장 큰 장애물|계획·실행·조정과 실제 결과",
        "노력했다는 표현에 구체적 행동이 있는가|성과를 과장하지 않는가",
        r"성취|성과|성공|도전|끈기|열정|목표|열심|뿌듯|보람|노력.*경험")
element("initiative", "achievement", "주도성과 개선 제안",
        "문제를 스스로 발견하고 필요한 변화를 실행하는가.",
        "기존 방식의 문제|내가 제안한 변화|실행 과정의 반응과 결과",
        "아이디어와 실제 실행을 구분하는가|구성원과 조율한 흔적이 있는가",
        r"주도|창의|창의성|혁신|개선.*(?:제안|경험)|적극적|자발적|수상")
element("failure-learning", "failure", "실패 인정과 학습",
        "실패 원인 중 자신의 몫을 인정하고 이후 행동을 바꾸는가.",
        "실패·실수와 내 책임|원인을 확인한 과정|재발 방지 행동과 이후 결과",
        "남 탓이나 운으로만 설명하지 않는가|반성 이후 행동 변화가 있는가",
        r"실패|실수|잘못|후회|반성|불합격|떨어|아쉬|포기|재도전")
element("feedback-change", "failure", "피드백 수용과 변화",
        "불편한 평가를 확인하고 실제 개선에 활용하는가.",
        "받은 지적·조언|동의하거나 확인한 내용|바꾼 행동과 달라진 평가",
        "무조건 수용이나 반박이 아닌 확인 과정이 있는가|이후 행동이 달라졌는가",
        r"피드백|조언|충고|잔소리|지적.*(?:받|경험)|쓴소리|비판.*받")
element("duty-reliability", "responsibility", "책임감과 성실한 완수",
        "맡은 약속을 지키고 문제 발생 시 결과까지 책임지는가.",
        "맡은 일과 기한|책임을 지키기 어려웠던 상황|완수·보고·후속 조치",
        "책임을 말로만 강조하지 않는가|실패 시 보고와 복구도 설명하는가",
        r"책임|성실|맡은.*일|끝까지|당직|주말.*근무|지각|출석|의무")
element("commitment-boundary", "responsibility", "헌신과 합리적 한계",
        "개인 부담과 공동 필요 사이에서 이유 있는 선택을 하는가.",
        "감수한 시간·비용·불편|선택한 이유|안전·건강·역할의 한계를 조율한 방법",
        "무제한 희생을 정답처럼 제시하지 않는가|공동 목적과 대안을 설명하는가",
        r"희생|헌신|손해|워라밸|워라벨|삶의\s*질|일과\s*삶|보수.*적|야근|초과근무")
element("organization-adaptation", "responsibility", "조직 적응과 관계 유지",
        "낯선 환경과 세대·역할 차이 속에서 업무 관계를 형성하는가.",
        "적응이 어려웠던 환경|규칙과 기대를 파악한 방법|관계 형성과 적응 결과",
        "집단을 고정관념으로 판단하지 않는가|부당한 관행까지 적응으로 미화하지 않는가",
        r"적응|세대|MZ|mz|텃세|규율|어떤\s*상사|싫은\s*상사|승선생활|함정생활|조직생활|단체생활")
element("service-action", "service", "봉사와 배려의 실행",
        "상대의 실제 필요를 이해하고 도움이 되는 행동을 했는가.",
        "도움이 필요했던 대상과 상황|본인이 직접 한 행동|상대에게 생긴 변화와 배운 점",
        "시간·횟수만 나열하지 않는가|상대의 의사와 필요를 존중했는가",
        r"봉사|배려|나눔|양보|이타|남을.*(?:위해|도)|타인.*(?:위해|도)|선한\s*영향력|민원")
element("respect-inclusion", "service", "존중과 차이의 수용",
        "차이를 고정관념으로 판단하지 않고 구성원을 존중하는가.",
        "다른 배경·관점을 만난 장면|편견을 알아차린 계기|존중을 행동으로 보인 사례",
        "집단 전체를 일반화하지 않는가|상대의 의사와 권리를 고려하는가",
        r"차별|혐오|성인지|성평등|성별|여성|남성|여경|남경|한남|김치녀|트랜스젠더|다문화|장애|소외|패럴림픽")
element("honesty", "integrity", "정직과 잘못의 인정",
        "불리한 상황에서도 사실을 왜곡하지 않고 책임 있게 설명하는가.",
        "정직함을 지키기 어려웠던 상황|실제 선택과 이유|선택의 결과와 감수한 부담",
        "사실과 추측을 구분하는가|거짓을 정당화하지 않고 대안을 검토하는가",
        r"정직|솔직|거짓|속인|속였|은폐|양심|일탈|법.*어긴|규칙.*어긴|규율.*어긴|나쁜\s*행동")
element("fairness-integrity", "integrity", "공정성과 이해충돌 판단",
        "친분·이익에 흔들리지 않고 일관된 기준으로 판단하는가.",
        "친분이나 이익과 기준이 충돌한 상황|판단에 사용한 기준|거절·설명·기록 등 행동",
        "작은 이익이라 괜찮다고 단정하지 않는가|적용 기준과 확인 절차가 있는가",
        r"청렴|공정|청탁|뇌물|금품|선물|접대|식사\s*대접|물고기.*(?:주|받)|해산물.*(?:주|받)|이해충돌|사익|사적|특혜|비리|승진|성과.*얻")
element("unjust-direction", "integrity", "부당한 요구에 대한 대응",
        "요구의 문제를 확인하고 근거와 절차를 통해 해결하는가.",
        "문제라고 판단한 요구|사실과 기준을 확인한 과정|설명·협의·보고 등 대응 순서",
        "모든 불편한 지시를 부당하다고 보지 않는가|무조건 따르거나 즉시 대립하는 답변을 피하는가",
        r"부당|갑질|괴롭|부정.*지시|위법.*지시|상사.*(?:불법|위법)|눈감|눈\s*감|악법")
element("public-mission", "public", "공직관과 공익",
        "공직의 책임을 이해하고 개인 이익과 공익의 관계를 설명하는가.",
        "중요하게 생각하는 공직 가치|그 이유와 개인 경험|국민을 위해 실천할 행동",
        "덕목을 나열하는 데 그치지 않는가|현실의 가치 충돌을 설명할 수 있는가",
        r"공직|공무원|국가관|사명|공익|덕목|공조직|사조직|경찰.*가치|해경.*가치|국민.*신뢰|국가.*국민|해양.*경찰.*중요")
element("rights-protection", "public", "권리 보호와 피해자 배려",
        "관련자의 권리와 추가 피해를 고려해 판단하는가.",
        "도움이 필요한 사람의 필요|피해를 키울 수 있는 행동|존중·보호·지원의 순서",
        "신상과 경험의 공개를 강요하지 않는가|선입견보다 사실과 필요를 확인하는가",
        r"인권|사회적\s*약자|성희롱|성추행|성폭|성범죄|피해자|2차\s*피해|미투|불법촬영|데이트\s*폭력")
element("emotion-regulation", "stress", "감정 인식과 조절",
        "감정을 알아차리고 타인과 업무에 미치는 영향을 조절하는가.",
        "감정이 올라오는 상황과 신호|실제로 사용한 조절 방법|조절 이후의 대화·행동",
        "화를 내지 않는다는 선언에 그치지 않는가|감정 억압과 조절을 구분하는가",
        r"스트레스|감정|화났|화가|화를|화내|분노|흥분|긴장|충동|자제|이성.*잃")
element("resilience", "stress", "회복과 도움 요청",
        "어려움을 겪은 뒤 일상을 회복하고 필요한 지원을 활용하는가.",
        "공유 가능한 어려움|회복에 도움이 된 행동·사람|이후 바뀐 대처 방식",
        "고통의 크기를 경쟁하지 않는가|혼자 견디는 것만을 능력으로 보지 않는가",
        r"힘들|힘든|어려움|극복|슬픈|슬플|외로|배신|상처|좌절|트라우마|두려|무서")
element("judgement-priority", "judgement", "가치 충돌과 우선순위",
        "서로 충돌하는 가치와 제약을 비교하고 판단 이유를 설명하는가.",
        "충돌하는 가치·이해관계|우선한 기준과 이유|다른 선택의 한계와 보완책",
        "질문에 없는 조건을 사실로 단정하지 않는가|선택 이유와 감수할 한계가 있는가",
        r"우선|둘\s*중|어느.*중요|무엇.*중요|뭐가.*중요|vs|VS|살릴|구할|구하|생명|안전|위기|긴급|만취.*출동")
element("problem-response", "judgement", "상황 파악과 단계적 대응",
        "사실을 확인하고 대안·행동·후속 확인을 순서 있게 제시하는가.",
        "확인해야 할 사실|가능한 대안과 선택 이유|행동 순서와 결과 점검 방법",
        "즉시 단정하기 전에 필요한 확인이 있는가|본인 권한과 지원 요청 시점을 고려하는가",
        r"어떻게.*(?:대응|대처|처리|조치|해결|하겠|하시겠|할\s*것|할\s*지|할\s*건|할\s*거|할꺼)|대처.*(?:경험|방법|법)|해결\s*방안|행동.*순서")

DISPOSITIONS = {
    "personal": "학생 인성 소재 연결 후보",
    "knowledge_review": "직무·시사 지식 재분류 검토",
    "context_needed": "앞선 문맥 확인",
    "rapport": "안부·진행 질문",
    "sensitive_review": "개인정보 수집 범위 검토",
    "unresolved": "요소 판정 보류",
}
FORMS = {"experience": "실제 경험", "value": "가치·이유", "situation": "가정 상황",
         "profile": "자기 설명", "mixed": "복합 질문", "context": "문맥 필요"}
FORM_GUIDES = {
    "experience": ["상황·목표", "내 역할", "내 행동과 선택 이유", "실제 결과", "배운 점·이후 변화"],
    "value": ["본인의 입장", "그 기준이 생긴 이유", "경험 또는 근거", "실천 방법·한계"],
    "situation": ["확인할 사실", "관련자·충돌 가치", "판단 기준", "행동 순서", "후속 확인·주의점"],
    "profile": ["핵심 주장", "실제 사례", "지원 분야와 연결", "한계·보완"],
    "mixed": ["하위 질문 분리", "질문마다 입장·행동·근거 연결", "답변 사이의 일관성 확인"],
    "context": ["원문 출처의 앞뒤 질문과 답변 확인", "불명확한 인물·사건을 임의로 만들지 않기"],
}


def analyze(question):
    prompt = question["prompt"]
    # Whitespace normalization is for matching only. Keep exact source wording.
    text = re.sub(r"\s+", " ", prompt)
    matches = []
    for e in ELEMENTS:
        match = re.search(e["pattern"], prompt, re.S)
        if match:
            matches.append(dict(element_id=e["id"], quote=match[0],
                                basis="질문 표현", interpretation=e["intent"]))
    disposition = "personal" if matches else "unresolved"
    flags = []
    if re.search(r"^(?:그\s*사람|그쪽|그\s*얘기|그렇게|그럼|그러면|그래서|그\s*상황|그때|주변인이|어떻게\s*풀|만약\s*들어오다)", text):
        flags.append("context_needed")
    if re.search(r"밥\s*(?:먹|은)|식사.*(?:했|하셨)|어떻게\s*왔|어떻게\s*오셨|긴장\s*많이|면접.*(?:끝나|끝났|끝난).*?(?:기분|연락|뭐|무엇|하고)", text):
        flags.append("rapport")
    if re.search(r"가족|부모|아버지|어머니|남자친구|여자친구|결혼|종교|주량|주사[가 는]|출신학교|출신\s*학교|트라우마|성추행.*(?:당한\s*적|당한적)|폭행.*휘말", text):
        flags.append("sensitive_review")
    # Do not claim these are job questions: the source category remains unchanged.
    if re.search(r"디젤|가솔린|보일러|항해장비|해사영어|(?:해양오염방지법|해양경비법|형법|형사소송법).*?(?:설명|무엇|아는)|(?:미투운동|5[.·]18|데이트\s*폭력).*?(?:무엇|의미|이란)|소득주도|영어로.*(?:답변|지시)|직급이\s*뭔|계급.*(?:나열|설명)", text):
        flags.append("knowledge_review")
    # Additional personal-history questions may have no assessable competency.
    if not matches and re.search(r"승선|승무|경력|근속|직장|아르바이트|알바|사회경험|사회\s*경험|학교생활|동아리|수험생활|졸업", text):
        flags.append("context_needed")
    for flag in ["sensitive_review", "knowledge_review", "rapport", "context_needed"]:
        if flag in flags:
            disposition = flag
            break
    if disposition == "personal":
        # A single confident category must not be inferred from the first regex.
        rationale = "문구에 근거한 복수 요소 후보입니다. 실제 평가 의도·주요 요소·필수 수집 범위는 원문 문맥을 확인해 결정합니다."
    else:
        rationale = {
            "context_needed": "앞선 질문·답변 또는 구체적 사례가 필요합니다. 독립된 필수 학생 입력 항목으로 만들지 않습니다.",
            "knowledge_review": "직무·시사 지식 확인 가능성이 있습니다. 원래 인성 분류는 보존하고 재분류 여부를 검토합니다.",
            "rapport": "안부 또는 면접 진행 질문일 수 있습니다. 별도의 필수 학생 데이터로 수집하지 않습니다.",
            "sensitive_review": "가족·건강 등 개인 정보 또는 사적인 경험을 요구할 수 있어 수집 필요성과 대체 질문을 검토합니다.",
            "unresolved": "문구만으로 평가 요소를 판정할 근거가 부족합니다. 원문과 앞뒤 문맥을 확인해야 합니다.",
        }[disposition]
    experience = bool(re.search(r"경험|한\s*적|했던|겪|살면서|해\s*본|해본", text))
    situation = bool(re.search(r"라면|한다면|경우|상황|어떻게.*(?:하겠|할\s*것|할\s*건|할\s*거|할\s*지|할꺼)|시\s*어떻게", text))
    value = bool(re.search(r"생각|이유|왜|가치|덕목|무엇.*중요|뭐가.*중요", text))
    form = "mixed" if sum([experience, situation, value]) > 1 else "experience" if experience else "situation" if situation else "value" if value else "profile"
    if disposition in ("context_needed", "unresolved"):
        form = "context"
    return dict(question_id=question["id"], source_prompt=prompt, source_category="personality",
                element_ids=[m["element_id"] for m in matches], evidence=matches,
                disposition=disposition, flags=flags, answer_form=form,
                rationale=rationale, status="draft", revision=1, method="wording-rules-v1",
                # Never confuse a keyword match with reviewed meaning.
                reviewer="", reviewed_at=None)


def main():
    corpus = json.loads((OUT / "interview-corpus.json").read_text(encoding="utf-8"))
    questions = [q for q in corpus["questions"] if q["category"] == "personality"]
    analyses = [analyze(q) for q in questions]
    overrides = json.loads((ROOT / "scripts/data/interview-personality-overrides.json").read_text(encoding="utf-8"))
    # Exact wording is checked per record. Re-importing revised source material
    # must never silently reuse an interpretation of a different question.
    by_id = {a["question_id"]: a for a in analyses}
    element_by_id = {e["id"]: e for e in ELEMENTS}
    for override in overrides["records"]:
        a = by_id[override["question_id"]]
        if a["source_prompt"] != override["source_prompt"]:
            raise ValueError("Curated interpretation no longer matches source: " + a["question_id"])
        disposition = override["disposition"]
        a.update(disposition=disposition, element_ids=override["element_ids"],
                 flags=[] if disposition == "personal" else [disposition],
                 method="analyst-semantic-v1")
        a["evidence"] = [dict(element_id=e, quote=a["source_prompt"], basis="질문 문맥 해석",
                              interpretation=element_by_id[e]["intent"]) for e in a["element_ids"]]
        if disposition == "personal":
            a["rationale"] = override.get("rationale", "질문 문맥을 해석한 초안입니다. " +
                " / ".join(element_by_id[e]["intent"] for e in a["element_ids"]) +
                " 학생 소재: " + " / ".join(element_by_id[e]["material_prompts"][0] for e in a["element_ids"]) +
                ". 실제 평가 의도와 수집 범위는 관리자 확인이 필요합니다.")
            text = a["source_prompt"]
            forms = [key for key, pattern in [
                ("experience", r"경험|한\s*적|했던|겪|살면서|해본|해\s*본"),
                ("situation", r"라면|한다면|경우|상황|어떻게.*(?:할|하겠)"),
                ("value", r"생각|이유|왜|가치|중요"),
            ] if re.search(pattern, text)]
            a["answer_form"] = "mixed" if len(forms) > 1 else forms[0] if forms else "profile"
        else:
            a["rationale"] = {
                "context_needed": "질문만으로는 평가할 행동·가치의 근거가 부족합니다. 앞뒤 질문·답변 또는 지원자의 구체적 사례를 확인한 뒤 요소를 연결합니다.",
                "knowledge_review": "직무·시사·제도에 관한 이해를 확인하는 질문으로 해석했습니다. 원본의 인성 분류를 보존하며 직무 재분류·최신 내용 검증 여부를 검토합니다.",
                "rapport": "면접 진행·안부·소감을 확인하는 질문으로 해석했습니다. 독립적인 필수 학생 데이터 항목으로 만들지 않습니다.",
                "sensitive_review": "개인 정보나 사적인 경험을 수집할 필요가 있는지 검토합니다. 평가 요소를 확인한 뒤 공유 가능한 대체 사례를 허용하며 필수 입력을 만들지 않습니다.",
            }[disposition]
            a["answer_form"] = "context"
    factors = [{k: v for k, v in e.items() if k != "pattern"} for e in ELEMENTS]
    occurrences = collections.Counter(o["question_id"] for o in corpus["occurrences"])
    counts = collections.Counter(a["disposition"] for a in analyses)
    frequency = collections.Counter(e for a in analyses for e in a["element_ids"])
    # A factor frequency is overlapping and NOT the official score weight.
    report = dict(source_sha256=hashlib.sha256((OUT / "interview-corpus.json").read_bytes()).hexdigest(),
                  questions=len(analyses), occurrences=sum(occurrences[q["id"]] for q in questions),
                  elements=len(factors), dispositions=dict(counts), element_candidates=dict(frequency),
                  reviewed_questions=0, method="analyst-designed elements; wording-rule suggestions + exact-question semantic drafts; all await admin review",
                  methods=dict(collections.Counter(a["method"] for a in analyses)),
                  answer_forms=dict(collections.Counter(a["answer_form"] for a in analyses)))
    data = dict(report=report, elements=factors, analyses=analyses)
    (OUT / "interview-personality-analysis.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    sql = ["-- Private analysis drafts. Does not alter questions, notes or publication status.", "begin;"]
    def literal(value):
        return "'" + json.dumps(value, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    for table, rows in [("ip_elements", factors), ("ip_question_analysis", analyses)]:
        pk = "id" if table == "ip_elements" else "question_id"
        for start in range(0, len(rows), 100):
            sql.append(f"insert into public.{table} select * from jsonb_populate_recordset(null::public.{table}, {literal(rows[start:start+100])}) on conflict ({pk}) do nothing;")
    sql.append("commit;")
    (OUT / "interview-personality-analysis.sql").write_text("\n".join(sql) + "\n", encoding="utf-8")
    (OUT / "interview-personality-analysis-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
