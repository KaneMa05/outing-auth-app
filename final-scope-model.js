(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  else root.FinalScopePlanModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const subjects = ["형사법", "형사소송법·공판", "해경개론", "해사법규", "해사영어", "항해", "기관"];
  function invalid(message) {
    const error = new Error(message);
    error.code = "invalid_final_scope_plan";
    error.status = 400;
    throw error;
  }
  function text(value, limit, label) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > limit) {
      invalid(`${label}을(를) 1~${limit}자로 입력해주세요.`);
    }
    return value.trim();
  }
  function normalize(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid("회독 플랜을 확인해주세요.");
    if (!Array.isArray(value.rounds) || !value.rounds.length || value.rounds.length > 30) {
      invalid("시험 회차는 1~30개로 구성해주세요.");
    }
    const seen = new Set();
    const rounds = value.rounds.map((item) => {
      if (!item || !Number.isInteger(item.round) || item.round < 1 || item.round > 999 || seen.has(item.round)) {
        invalid("회차 번호는 중복 없이 1~999 사이의 정수로 입력해주세요.");
      }
      seen.add(item.round);
      const entries = subjects.map((subject) => {
        const units = item.subjects?.[subject];
        if (!Array.isArray(units) || units.length < 1 || units.length > 24) {
          invalid(`${item.round}회차 ${subject}의 단원을 1~24개 입력해주세요.`);
        }
        return [subject, units.map((unit) => ({
          code: text(unit?.code, 40, `${item.round}회차 ${subject} 일차`),
          text: text(unit?.text, 2000, `${item.round}회차 ${subject} 범위`),
        }))];
      });
      return {
        round: item.round,
        date: text(item.date, 40, `${item.round}회차 시험일`),
        code: text(item.code, 80, `${item.round}회차 회독 일정`),
        subjects: Object.fromEntries(entries),
      };
    }).sort((a, b) => a.round - b.round);
    const plan = { title: text(value.title, 100, "플랜 제목"), rounds };
    if (JSON.stringify(plan).length > 200000) invalid("플랜 내용이 너무 깁니다. 범위를 간결하게 입력해주세요.");
    return plan;
  }
  function normalizeOrNull(value) {
    try { return normalize(value); } catch { return null; }
  }
  function guideRows(plan) {
    const groups = [];
    for (const round of plan.rounds) {
      const code = String(round.code || "");
      const days = code.match(/^(\d+)-\d/);
      const label = code.replace(/\s/g, "") === "전범위" ? "전범위 모의고사"
        : days ? `${days[1]}일 동안 1회독` : code;
      const previous = groups[groups.length - 1];
      if (previous && previous.label === label && previous.end + 1 === round.round) previous.end = round.round;
      else groups.push({ start: round.round, end: round.round, label });
    }
    return groups.map(({ start, end, label }) => [start === end ? `${start}회차` : `${start}~${end}회차`, label]);
  }
  return { subjects, normalize, normalizeOrNull, guideRows };
});
