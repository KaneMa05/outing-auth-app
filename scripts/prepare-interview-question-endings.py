"""Change interviewer endings without letting a model rewrite question meaning."""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / 'artifacts/interview-question-audio'

def validate(text):
    return bool(text and re.search(r'니까\?$', text) and not re.search(r'(?:할거냐|할꺼냐|뭐냐|말해봐라)[?.!]', text))

def ending(text, category):
    parts = [part.strip() for part in re.split(r'[?？]+', text) if part.strip()]
    return ' '.join(_ending(part, category) for part in parts)

def _ending(text, category):
    s = re.sub(r'\s+', ' ', text).strip()
    s = s.replace('내가 ', '본인이 ').replace('나의 ', '본인의 ').replace('너의 ', '본인의 ')
    s = re.sub(r'[.!?？。…~\s]+$', '', s)
    s = s.replace('하실겁니까', '하시겠습니까')
    if s.endswith('니까'):
        return s + '?'
    for pattern, replacement in [
        (r'(?:설명해\s*(?:보세요|봐라|보라|보시오|보아라|주세요)|설명하시오|설명하세요)$', '설명해 주시겠습니까'),
        (r'(?:말씀해\s*(?:보세요|주세요)|말해\s*(?:보세요|봐라|보라|보시오|보아라|주세요)|말하시오|말해라|말하세요|얘기해\s*(?:봐라|보라)|이야기\s*해\s*(?:보세요|보라)|작성하세요|서술하시오)$', '말씀해 주시겠습니까'),
        (r'해\s*(?:보세요|봐라|보아라|보라|주세요)$', '해 주시겠습니까'),
        (r'생각(?:하는가|하느냐|하냐|하나|하는지|하세요|하죠|해)$', '생각하십니까'),
        (r'할\s*(?:것인가|것인지|것이냐|거냐|꺼냐|건지|건가|건가요|거에요|래)$', '하시겠습니까'),
        (r'하겠(?:는가|느냐|냐|는지|나)$', '하시겠습니까'),
        (r'어쩔(?:거냐|꺼냐|건가|건지)$', '어떻게 하시겠습니까'),
        (r'어쩌냐$', '어떻게 하시겠습니까'),
        (r'(?:거냐|꺼냐)$', ' 것인지 말씀해 주시겠습니까'),
        (r'(?:겠어요|겠냐|겠나|겠나요|겠느냐)$', '겠습니까'),
        (r'(?:셨나요|셨어요)$', '셨습니까'),
        (r'(?:시나요|시죠)$', '십니까'),
        (r'할까요$', '하시겠습니까'),
        (r'말이죠$', '말입니까'),
        (r'([가-힣])어요$', r'\1습니까'),
        (r'([았었였])(?:나요|어요|냐|나)$', r'\1습니까'),
        (r'([가-힣]*[갔왔봤땄탔됐랬쳤])(?:나요|어요|냐|나)$', r'\1습니까'),
        (r'많냐$', '많습니까'),
        (r'짧냐$', '짧습니까'),
        (r'크냐$', '큽니까'),
        (r'잇냐$', '있습니까'),
        (r'어디냐$', '어디입니까'),
        (r'언제냐$', '언제입니까'),
        (r'이냐$', '입니까'),
        (r'있어요$', '있습니까'),
        (r'없어요$', '없습니까'),
        (r'(?:뭐냐|뭔가|뭐에요|뭐예요|무엇인가|무엇이냐|무엇인가요)$', '무엇입니까'),
        (r'누구(?:냐|인가|인가요)$', '누구입니까'),
        (r'있겠(?:는가|느냐|냐)$', '있겠습니까'),
        (r'있(?:는가|느냐|냐|나|나요|으시나요)$', '있습니까'),
        (r'없(?:는가|느냐|냐|나|나요)$', '없습니까'),
        (r'같(?:은가|으냐|냐|나|나요)$', '같습니까'),
        (r'좋(?:은가|으냐|냐|나|나요)$', '좋습니까'),
        (r'괜찮(?:은가|으냐|냐|나|나요)$', '괜찮습니까'),
        (r'어떻게$', '어떻게 하시겠습니까'),
        (r'인가$', '입니까'),
    ]:
        result, n = re.subn(pattern, replacement, s)
        if n:
            return result + '?'
    for pattern, replacement in [
        (r'했(?:는가|느냐|냐|나|나요|어요)$', '했는지'),
        (r'왔(?:는가|느냐|냐|나|나요|어요)$', '왔는지'),
        (r'봤(?:는가|느냐|냐|나|나요|어요)$', '봤는지'),
        (r'하(?:는가|느냐|냐|나|나요)$', '하는지'),
        (r'되(?:는가|느냐|냐|나|나요)$', '되는지'),
        (r'아(?:는가|느냐|냐|나|나요)$', '아는지'),
        (r'싶(?:은가|으냐|냐|나|나요)$', '싶은지'),
        (r'는가$', '는지'),
        (r'한가$', '한지'),
        (r'었느냐$', '었는지'),
        (r'았느냐$', '았는지'),
        (r'었냐$', '었는지'),
        (r'았냐$', '았는지'),
        (r'나요$', '는지'),
        (r'죠$', '는지'),
        (r'냐$', '는지'),
        (r'나$', '는지'),
    ]:
        result, n = re.subn(pattern, replacement, s)
        if n:
            return result + ' 말씀해 주시겠습니까?'
    if re.search(r'(?:는지|인지|한지|할지|뭔지|건지)$', s):
        return s + ' 말씀해 주시겠습니까?'
    if s.endswith(('대해', '대해서', '관해', '관해서', '아는대로', '아는 대로')):
        return s + ' 설명해 주시겠습니까?'
    if s.endswith('설명'):
        return s[:-2].rstrip() + ' 설명해 주시겠습니까?'
    if s.endswith(('한다면', '된다면', '있다면', '없다면', '경우', '때', '하는데', '했는데')):
        return s + ' 어떻게 하시겠습니까?'
    if s.endswith(('있다', '한다', '된다', '했다', '준다', '부족하다')):
        return s + '. 이 상황에서 어떻게 하시겠습니까?'
    # Bare topics keep their wording; attach a request rather than inventing detail.
    if s.endswith(('은', '는')):
        s = s[:-1].rstrip()
    if s.endswith(('을', '를')):
        return s + ' 말씀해 주시겠습니까?'
    if s.endswith(('경험', '이유', '사례', '포부', '지원동기', '자기소개')):
        particle = '을' if (ord(s[-1])-0xAC00) % 28 else '를'
        return s + particle + ' 말씀해 주시겠습니까?'
    return s + '에 대해 ' + ('설명해' if category == 'job' else '말씀해') + ' 주시겠습니까?'

def main():
    bank = json.loads((FOLDER / 'questions-20261030.json').read_text())['questions']
    overrides = {}
    for name in ['personality', 'spoken']:
        overrides.update(json.loads((ROOT / f'scripts/data/interview-audio-{name}-overrides.json').read_text()))
    rows = []
    for q in bank:
        text = ending(overrides.get(q['prompt'], q['prompt']), q['category'])
        assert validate(text), (q['id'], text)
        rows.append({**q, 'spokenPrompt': text, 'editingPolicy': 'preserve-content-formal-endings-v1'})
    (FOLDER / 'questions-interviewer.json').write_text(json.dumps({'questions': rows}, ensure_ascii=False, indent=2))
    print('Scripts finished: ' + str(len(rows)), flush=True)

if __name__ == '__main__':
    main()
