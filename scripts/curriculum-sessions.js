// Session boundaries follow the "비고" column (n일차) in 론박_커리큘럼_DB.xlsx.
// Only detailed curriculum rows are included; 과목구성 summary totals are not used as boundaries.
const { CURRICULUM_WORKBOOK_DAY_COUNTS } = require("./curriculum-workbook-days");
const CURRICULUM_SESSION_PLANS = Object.fromEntries(
  Object.entries(CURRICULUM_WORKBOOK_DAY_COUNTS).map(([subjectId, counts]) => [subjectId, dayPlan(counts)])
);

function dayPlan(dayLectureCounts) {
  let end = 0;
  return dayLectureCounts.map((lectureCount, index) => {
    end += lectureCount;
    return { day: index + 1, end };
  });
}

function restructureCurriculumIntoSessions(subjects, plans = CURRICULUM_SESSION_PLANS) {
  return (Array.isArray(subjects) ? subjects : []).map((subject) => {
    const lectures = (Array.isArray(subject.stages) ? subject.stages : []).flatMap((stage) =>
      (Array.isArray(stage.lectures) ? stage.lectures : []).map((lecture) => ({
        lecture,
        isPublished: stage.isPublished !== false,
        requiresWrapUp: stage.requiresWrapUp !== false,
      }))
    );
    const subjectPlan = plans[subject.id];
    if (!Array.isArray(subjectPlan) || !subjectPlan.length) return subject;
    if (subjectPlan.at(-1).end !== lectures.length) {
      throw new Error(`${subject.id}: 비고 일차는 ${subjectPlan.at(-1).end}강까지 있지만 ${lectures.length}강이 로드되었습니다.`);
    }

    let start = 0;
    const sessions = subjectPlan.map((session, index) => {
      const items = lectures.slice(start, session.end);
      start = session.end;
      if (!items.length) throw new Error(`${subject.id}: ${index + 1}일차에 강의가 없습니다.`);
      const stageTitle = items
        .map((item) => String(item.lecture.title || "").trim())
        .filter(Boolean)
        .join(", ");
      return {
        id: `${subject.id}-session-${index + 1}`,
        stageNumber: index + 1,
        curriculumDay: session.day || index + 1,
        title: stageTitle,
        sortOrder: index + 1,
        isPublished: items.every((item) => item.isPublished),
        requiresWrapUp: items.some((item) => item.requiresWrapUp),
        lectures: items.map((item, lectureIndex) => ({ ...item.lecture, sortOrder: lectureIndex + 1 })),
      };
    });
    return { ...subject, totalStages: sessions.length, stages: sessions };
  });
}

module.exports = { CURRICULUM_SESSION_PLANS, dayPlan, restructureCurriculumIntoSessions };
