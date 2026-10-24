'use strict';
// Fixed question text from the existing core collection. Answers are authored by students.
// Keep this catalog and the migration seed in sync; no runtime dependency on seed files.
const units=[
  {
    "id": "core-01",
    "group": "핵심인성 25제",
    "title": "핵심인성 1번",
    "prompt": "본인의 강점을 살려 우리 조직에 들어와 발휘 하는 있는 점?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-02",
    "group": "핵심인성 25제",
    "title": "핵심인성 2번",
    "prompt": "공동 목표를 위해 자신이 희생한 경험은?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-03",
    "group": "핵심인성 25제",
    "title": "핵심인성 3번",
    "prompt": "자신의 단점?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-04",
    "group": "핵심인성 25제",
    "title": "핵심인성 4번",
    "prompt": "공무원들의 고쳐야 할 점 / 공직관 심화",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-05",
    "group": "핵심인성 25제",
    "title": "핵심인성 5번",
    "prompt": "학창시절 동아리 활동은?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-06",
    "group": "핵심인성 25제",
    "title": "핵심인성 6번",
    "prompt": "사람들 간의 문제를 해결한 적은?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-07",
    "group": "핵심인성 25제",
    "title": "핵심인성 7번",
    "prompt": "(불안형 질문)일이 육체적으로 힘들고 박봉인데 선택한 이유는?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-08",
    "group": "핵심인성 25제",
    "title": "핵심인성 8번",
    "prompt": "(학교/승선/의경 생활시) 상사에게 어떤 평가를 받았는지?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-09",
    "group": "핵심인성 25제",
    "title": "핵심인성 9번",
    "prompt": "상사가 부당한 지시를 내렸을 때?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-10",
    "group": "핵심인성 25제",
    "title": "핵심인성 10번",
    "prompt": "스트레스는 언제 받고, 어떻게 해소하는지?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-11",
    "group": "핵심인성 25제",
    "title": "핵심인성 11번",
    "prompt": "창의적인 의견을 건의하여 기여했던 적은?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-12",
    "group": "핵심인성 25제",
    "title": "핵심인성 12번",
    "prompt": "10년 후 자신의 모습은?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-13",
    "group": "핵심인성 25제",
    "title": "핵심인성 13번",
    "prompt": "공무원이 갖추어야 할 성인지감수성은?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-14",
    "group": "핵심인성 25제",
    "title": "핵심인성 14번",
    "prompt": "마지막 하고 싶은 말은?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-15",
    "group": "핵심인성 25제",
    "title": "핵심인성 15번",
    "prompt": "실패했던 경험이 있나요?  / 실패를 통해 무얼 배웠나요?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-16",
    "group": "핵심인성 25제",
    "title": "핵심인성 16번",
    "prompt": "화가 나면 참는 편인가요? 화를 내는 편인가요?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-17",
    "group": "핵심인성 25제",
    "title": "핵심인성 17번",
    "prompt": "우리 조직의 홍보 방법에 대해서 말해 보세요.",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-18",
    "group": "핵심인성 25제",
    "title": "핵심인성 18번",
    "prompt": "(불안형) 입사 후 자신이 맡은 업무가 자신의 생각과 달랐다면 어떻게 하겠습니까?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-19",
    "group": "핵심인성 25제",
    "title": "핵심인성 19번",
    "prompt": "(사고관련) 안전사고는 왜 일어난다고 생각합니까?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-20",
    "group": "핵심인성 25제",
    "title": "핵심인성 20번",
    "prompt": "최근에 본 영화나 책은 무엇입니까?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-21",
    "group": "핵심인성 25제",
    "title": "핵심인성 21번",
    "prompt": "본인은 어떤 리더십을 가지고 있습니까?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-22",
    "group": "핵심인성 25제",
    "title": "핵심인성 22번",
    "prompt": "과정과 결과 중 무엇이 더 중요한가요?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-23",
    "group": "핵심인성 25제",
    "title": "핵심인성 23번",
    "prompt": "존경하는 인물이 있습니까?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-24",
    "group": "핵심인성 25제",
    "title": "핵심인성 24번",
    "prompt": "본인이 생각할 때 좋은 팀워크를 이루기 위한 3가지는?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "core-25",
    "group": "핵심인성 25제",
    "title": "핵심인성 25번",
    "prompt": "공무원에게 있어 음주 문제가 중요한 이유는?",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  },
  {
    "id": "other",
    "group": "기타질문",
    "title": "기타질문",
    "prompt": "추가로 준비할 질문에 대한 나의 답변을 작성하세요. 여러 질문은 답변 안에서 구분해주세요.",
    "fields": [
      {
        "id": "f1",
        "label": "내 답변",
        "required": true
      }
    ]
  }
];
// Historical questions stay available to administrators; student work is core 25 only.
const studentUnits=units.filter(u=>u.id.startsWith('core-'));
module.exports={units,studentUnits};
