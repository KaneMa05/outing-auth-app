// Date boundaries follow the "시간표" sheet in the 2026 second-half offline curriculum workbook.
const CURRICULUM_SESSION_PLANS = {
  "criminal-law": plan([
    ["2026-06-21", 8], ["2026-06-28", 15], ["2026-07-05", 26], ["2026-07-12", 36],
    ["2026-07-19", 46], ["2026-07-26", 55], ["2026-08-02", 68], ["2026-08-09", 75],
    ["2026-08-16", 80], ["2026-08-23", 96], ["2026-08-30", 100], ["2026-09-06", 108],
  ]),
  "coast-guard-intro": plan([
    ["2026-06-22", 2], ["2026-06-23", 8], ["2026-06-29", 13], ["2026-07-06", 18],
    ["2026-07-10", 22], ["2026-07-13", 27], ["2026-07-16", 30], ["2026-07-20", 35],
    ["2026-07-24", 40], ["2026-07-27", 46], ["2026-07-30", 49], ["2026-08-03", 54],
    ["2026-08-07", 60], ["2026-08-10", 67], ["2026-08-14", 73], ["2026-08-17", 77],
    ["2026-08-24", 80], ["2026-08-31", 84], ["2026-09-04", 86],
  ]),
  "maritime-law": plan([
    ["2026-06-22", 2], ["2026-06-26", 6], ["2026-07-03", 11], ["2026-07-10", 16],
    ["2026-07-16", 23], ["2026-07-24", 28], ["2026-07-30", 36], ["2026-08-07", 43],
    ["2026-08-14", 51], ["2026-08-21", 57], ["2026-08-28", 64], ["2026-09-03", 70],
    ["2026-09-04", 73],
  ]),
  "maritime-english": plan([
    ["2026-06-22", 1], ["2026-06-24", 5], ["2026-07-01", 11], ["2026-07-08", 17],
    ["2026-07-15", 21], ["2026-07-22", 26], ["2026-07-29", 29], ["2026-08-05", 34],
    ["2026-08-12", 38], ["2026-08-19", 42], ["2026-08-26", 46], ["2026-09-02", 51],
    ["2026-09-09", 55], ["2026-09-16", 58],
  ]),
  "navigation-technique": plan([
    ["2026-06-22", 1], ["2026-06-25", 5], ["2026-06-30", 8], ["2026-07-02", 12],
    ["2026-07-07", 16], ["2026-07-09", 19], ["2026-07-14", 23], ["2026-07-21", 27],
    ["2026-07-23", 30], ["2026-07-28", 34], ["2026-07-31", 37], ["2026-08-04", 40],
    ["2026-08-06", 44], ["2026-08-11", 47], ["2026-08-13", 49], ["2026-08-18", 53],
    ["2026-08-20", 57], ["2026-08-25", 59], ["2026-08-27", 63], ["2026-09-01", 66],
    ["2026-09-08", 69], ["2026-09-10", 72], ["2026-09-15", 74],
  ]),
  "marine-engineering": plan([
    ["2026-06-22", 1], ["2026-06-25", 4], ["2026-06-30", 7], ["2026-07-02", 10],
    ["2026-07-07", 13], ["2026-07-09", 16], ["2026-07-14", 19], ["2026-07-21", 22],
    ["2026-07-23", 25], ["2026-07-28", 28], ["2026-07-31", 31], ["2026-08-04", 34],
    ["2026-08-06", 36], ["2026-08-11", 39], ["2026-08-13", 42], ["2026-08-18", 45],
    ["2026-08-20", 48], ["2026-08-25", 53], ["2026-09-01", 56], ["2026-09-08", 59],
    ["2026-09-10", 62], ["2026-09-15", 64],
  ]),
};

function plan(rows) {
  return rows.map(([date, end]) => ({ date, end }));
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
      throw new Error(`${subject.id}: session plan ends at ${subjectPlan.at(-1).end}, but ${lectures.length} lectures were loaded`);
    }

    let start = 0;
    const sessions = subjectPlan.map((session, index) => {
      const items = lectures.slice(start, session.end);
      start = session.end;
      if (!items.length) throw new Error(`${subject.id}: session ${index + 1} has no lectures`);
      const stageTitle = items
        .map((item) => String(item.lecture.title || "").trim())
        .filter(Boolean)
        .join(", ");
      return {
        id: `${subject.id}-session-${index + 1}`,
        stageNumber: index + 1,
        title: stageTitle,
        scheduledDate: session.date,
        sortOrder: index + 1,
        isPublished: items.every((item) => item.isPublished),
        requiresWrapUp: items.some((item) => item.requiresWrapUp),
        lectures: items.map((item, lectureIndex) => ({ ...item.lecture, sortOrder: lectureIndex + 1 })),
      };
    });
    return { ...subject, totalStages: sessions.length, stages: sessions };
  });
}

module.exports = { CURRICULUM_SESSION_PLANS, restructureCurriculumIntoSessions };
