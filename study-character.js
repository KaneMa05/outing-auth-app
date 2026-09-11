// Shared allowlist and vector geometry for the character selector and API.
(function (root) {
  "use strict";
  const styles = Object.freeze([
  {
    "id": "default",
    "name": "기본 머리"
  },
  {
    "id": "sport",
    "name": "스포츠 컷",
    "path": "M11 23 L11 17 Q11 8 20 8 L29 8 Q38 9 38 17 L38 23 L35 21 L34 16 Q25 14 15 16 L14 22 Z",
    "shine": "M17 11 L18 12 M22 10 L23 11 M27 10 L28 11 M32 11 L33 12"
  },
  {
    "id": "spiky",
    "name": "삐죽 숏컷",
    "path": "M10 24 Q7 18 11 13 Q13 10 15 10 Q12 7 14 4 Q17 8 21 7 Q19 3 22 1 Q24 6 28 7 Q28 3 31 4 Q31 8 35 11 Q40 14 39 20 L37 25 Q34 23 34 18 Q31 22 27 19 Q25 23 22 19 Q19 22 15 18 L13 25 Z",
    "shine": "M15 13 Q18 11 21 12 M25 11 Q30 10 34 14"
  },
  {
    "id": "mushroom",
    "name": "버섯 머리",
    "path": "M8 27 Q3 25 6 17 Q5 6 17 3 Q30 0 38 7 Q44 12 43 20 Q46 26 39 28 L35 27 L34 17 Q31 20 27 20 L30 15 Q23 24 13 23 L13 28 Z",
    "shine": "M11 13 Q16 6 25 7 M17 18 Q25 15 29 10 M35 11 Q39 15 38 20"
  },
  {
    "id": "wave",
    "name": "내추럴 웨이브",
    "path": "M10 26 Q6 24 8 19 Q4 13 10 10 Q8 5 15 5 Q18 0 23 4 Q29 0 33 5 Q40 3 40 11 Q45 15 40 20 Q42 25 37 27 L34 21 Q30 23 28 18 Q23 23 20 18 Q15 23 13 20 L13 26 Z",
    "shine": "M13 11 Q15 7 19 9 M25 8 Q29 6 32 10"
  },
  {
    "id": "ponytail",
    "name": "하이 포니테일",
    "path": "M31 7 Q31 0 39 2 Q47 4 45 15 Q43 24 48 28 Q42 34 37 28 Q33 24 36 15 Q38 9 33 11 Z M10 25 Q7 16 11 9 Q15 3 25 4 Q36 4 39 14 L39 25 L35 25 L34 16 Q29 15 25 11 Q21 16 15 17 L14 25 Z",
    "shine": "M13 13 Q16 8 22 8 M29 8 Q33 10 35 13 M38 6 Q43 9 40 17 Q38 23 42 27",
    "ties": "M32 5 L36 9"
  }
].map(Object.freeze));
  const isValid = value => typeof value === "string" && styles.some(style => style.id === value);
  const normalize = value => isValid(value) ? value : "default";
  // Derived from the existing daily study total; no extra persisted level is needed.
  const thresholds = Object.freeze([10800, 18000, 25200, 32400, 36000]);
  const fireNames = Object.freeze(["공부 시작", "집중의 불씨", "타오르는 집중", "몰입의 불꽃", "뜨거운 몰입", "황금 불꽃"]);
  const finiteSeconds = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  const getFireStage = value => thresholds.filter(threshold => finiteSeconds(value) >= threshold).length;
  const fire = Object.freeze({
    thresholds,
    names: fireNames,
    getStage: getFireStage,
    getLabel(value) {
      const stage = getFireStage(value);
      return stage ? `${thresholds[stage - 1] / 3600}시간 달성 · ${fireNames[stage]}` : "3시간부터 집중의 불씨가 켜져요";
    },
    getSeconds({ baseSeconds = 0, sampledAt = 0, now = 0, running = false, dateKey, todayKey }) {
      if (dateKey && todayKey && dateKey !== todayKey) return 0;
      return finiteSeconds(baseSeconds) + (running && sampledAt > 0 ? finiteSeconds((now - sampledAt) / 1000) : 0);
    },
    paths: Object.freeze([
      "M60 120C31 120 8 109 9 87C9 71 21 66 17 48C28 54 34 61 35 70C31 43 56 33 50 4C72 16 82 40 76 60C87 51 93 38 89 29C110 47 115 64 105 81C111 78 115 72 114 68C128 102 101 120 60 120Z",
      "M61 117C36 117 23 108 24 91C24 81 32 73 30 66C41 73 44 79 44 85C43 60 62 46 61 27C78 43 77 60 72 72C82 68 87 61 88 53C103 69 98 84 92 91C104 88 98 109 85 113C78 116 70 117 61 117Z",
      "M63 117C45 117 39 107 42 96C45 87 54 82 55 70C64 77 68 85 65 94C73 91 77 84 78 78C91 96 83 117 63 117Z",
    ]),
  });
  const api = Object.freeze({ styles, isValid, normalize, fire });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StudyCharacterStyles = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
