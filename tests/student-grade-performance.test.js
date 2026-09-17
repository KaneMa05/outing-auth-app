const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");

const studentSource = fs.readFileSync("student.js", "utf8");
const sharedSource = fs.readFileSync("shared.js", "utf8");
const extract = (source, name) => {
  const match = source.match(new RegExp(`function ${name}\\([^]*?\\n}`));
  assert.ok(match, name);
  return match[0];
};
const benchmark = process.argv.includes("--benchmark");

function fixture(weeks = 8, count = 24) {
  const state = { students: [], exams: [], examSections: [], examAnswers: [], examSubmissions: [], finalExamScores: [] };
  state.students = Array.from({ length: count }, (_, i) => ({ id: `s${i}`, track: i % 2 ? "B" : "A", cohort: "18" }));
  state.students.push({ id: "other-cohort", track: "A", cohort: "19" }, { id: "other-track", track: "C", cohort: "18" });
  for (let week = 1; week <= weeks; week++) {
    const exam = { id: `e${week}`, weekNumber: week, cohort: "18" };
    state.exams.push(exam);
    for (const track of ["A", "B"]) {
      for (const subject of ["law", "scoped", "navigation"]) {
        const section = { id: `${exam.id}-${track}-${subject}`, examId: exam.id, track, subject, questionCount: 12, totalScore: 60 };
        state.examSections.push(section);
        for (let question = 1; question <= 12; question++) {
          state.examAnswers.push({ examSectionId: section.id, questionNumber: question, correctAnswer: "1", points: 5, targetTracks: question <= 8 ? ["A", "B"] : ["B"] });
        }
        state.students.filter((student) => student.track === track).forEach((student, i) => {
          if (i === 3 || (i === 2 && subject === "navigation")) return;
          const correctCount = (i + week) % 8;
          state.examSubmissions.push({ id: `${section.id}-${student.id}`, studentId: student.id, examSectionId: section.id, status: "submitted", score: correctCount * 5, correctCount });
        });
      }
    }
    state.students.forEach((student, i) => state.finalExamScores.push({ studentId: student.id, round: week, score: (i + week) % 10 * 5, maxScore: 100, wrongCount: 10 }));
  }
  const first = state.examSubmissions[0];
  state.examSubmissions.unshift({ ...first, status: "draft", score: 999 });
  state.examSubmissions.push({ ...first, score: 999 });
  return state;
}

function harness(source, state) {
  const stats = { sections: 0, answers: 0, submissions: 0, finalRounds: [], weeks: new Set() };
  const context = vm.createContext({
    state,
    normalizeCoastGuardTrack: (track) => String(track || "").trim(),
    getStudentProfile: () => null,
    getStudentCohort: (student) => student.cohort,
    isSameGradeRankingGroup: (a, b) => a === b || [a, b].every((track) => ["A", "B"].includes(track)),
    compareWeeklySubjects: (a, b) => a.localeCompare(b),
    isWeeklySubjectAllowedForTrack: () => true,
    isWeeklyQuestionTrackScopedSubject: (subject) => subject === "scoped",
    isWeeklyQuestionForTrack: (answer, track) => answer.targetTracks.includes(track),
    hasExamCorrectAnswer: (answer) => Boolean(answer.correctAnswer),
    getWeeklyAnswerPointValue: (answer) => answer.points,
    formatStudentWeeklyExamName: (week) => `${week}주차`,
    getFinalGradeSubjectHeadersForTrack: () => [],
    getFinalGradeSubjectHeaders: () => [],
  });
  for (const name of ["preferTrackSpecificWeeklySections", "shouldScaleWeeklyVisibleAnswerPoints", "sumWeeklyAnswerPoints"]) {
    vm.runInContext(extract(sharedSource, name), context);
  }
  const names = ["getStudentRegisteredTrack", "getStudentExamSections", "isStudentSectionMatch", "isStudentSectionPublished", "getStudentVisibleSectionAnswers", "getStudentSubmission", "getStudentWeeklyGradeSummary", "getStudentPreviousWeeklyGradeSummary", "getStudentSubjectGradeSummary", "calculateStudentTopPercent", "getStudentFinalGradeSummary", "getStudentFinalScoreRecords", "normalizeStudentFinalSubjectScores", "applyStudentFinalSubjectRanks"];
  if (source.includes("function createStudentWeeklyGradeLookup(")) names.push("createStudentWeeklyGradeLookup");
  for (const name of names) vm.runInContext(extract(source, name), context);
  for (const [name, key] of [["getStudentExamSections", "sections"], ["getStudentVisibleSectionAnswers", "answers"], ["getStudentSubmission", "submissions"]]) {
    const original = context[name];
    context[name] = (...args) => {
      stats[key]++;
      if (key === "sections") stats.weeks.add(args[0].weekNumber);
      return original(...args);
    };
  }
  const finalRecords = context.getStudentFinalScoreRecords;
  context.getStudentFinalScoreRecords = (round) => { stats.finalRounds.push(round); return finalRecords(round); };
  return { context, stats };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const state = fixture();
const { context, stats } = harness(studentSource, state);
const student = state.students[0];
const exam = state.exams.at(-1);
const summary = context.getStudentWeeklyGradeSummary(exam, student);
assert.equal(summary.sectionCount, 3);
assert.equal(summary.submittedCount, 3);
assert.equal(summary.score, 0, "zero scores remain submitted grades");
assert.equal(summary.maxScore, 180, "track-specific question sets retain their scaled maximum");
assert.equal(summary.wrongCount, 32);
assert.ok(summary.rank > 0);
assert.equal(summary.total, 22, "exclude other cohorts/tracks and completely absent students");
assert.deepEqual([...stats.weeks].sort(), [7, 8], "only current and previous weeks are calculated");
assert.equal(stats.sections, 4, "reuse sections for each of two tracks across two weeks");
assert.ok(stats.answers <= 24, "answer filtering must not repeat for each peer");
assert.equal(stats.submissions, 0, "rank calculation must not scan the entire submissions list per peer");

// Compare indexed and uncached access using the same publication, track and ranking rules.
const uncached = {
  getSections: context.getStudentExamSections,
  getAnswers: context.getStudentVisibleSectionAnswers,
  getSubmission: context.getStudentSubmission,
};
for (const peer of [state.students[0], state.students[1], state.students[4], state.students[6]]) {
  assert.deepEqual(plain(context.getStudentWeeklyGradeSummary(exam, peer)), plain(context.getStudentWeeklyGradeSummary(exam, peer, uncached)));
}
const firstWeek = context.getStudentWeeklyGradeSummary(state.exams[0], student);
assert.ok(firstWeek.score < 999, "drafts and later duplicate submissions cannot replace the first submitted score");
assert.equal(firstWeek.previousRank, 0);
const ownSubmission = state.examSubmissions.find((row) => row.studentId === student.id && row.examSectionId === `${exam.id}-A-law`);
ownSubmission.score = 45;
assert.equal(context.getStudentWeeklyGradeSummary(exam, student).score, 45, "a fresh lookup must reflect in-place score edits");
state.examSubmissions = state.examSubmissions.filter((row) => row !== ownSubmission);
assert.equal(context.getStudentWeeklyGradeSummary(exam, student).submittedCount, 2, "remote deletions must be visible on the next render");
state.examAnswers.find((answer) => answer.examSectionId === `${exam.id}-A-law`).correctAnswer = "";
assert.equal(context.getStudentWeeklyGradeSummary(exam, student).sectionCount, 2, "unpublished/incomplete answer keys must still hide their section");

context.getStudentFinalGradeSummary(student, 8);
assert.deepEqual(stats.finalRounds, [8, 7], "final grade comparison must stop at the preceding round");
const noPrevious = fixture();
noPrevious.exams = noPrevious.exams.filter((item) => item.weekNumber !== 7);
const missing = harness(studentSource, noPrevious).context.getStudentWeeklyGradeSummary(noPrevious.exams.at(-1), noPrevious.students[0]);
assert.equal(missing.previousRank, 0);
assert.equal(missing.rankDelta, "");

if (benchmark) {
  // Optional local comparison with the checked-in pre-change code; no production data or writes.
  const legacy = fs.readFileSync(0, "utf8");
  const large = fixture(16, 100);
  const timings = [];
  const results = [];
  for (const source of [legacy, studentSource]) {
    const run = harness(source, large);
    const start = performance.now();
    results.push(plain(run.context.getStudentWeeklyGradeSummary(large.exams.at(-1), large.students[0])));
    timings.push(performance.now() - start);
    const final = plain(run.context.getStudentFinalGradeSummary(large.students[0], 16));
    if (results.length === 1) results.push(final);
    else assert.deepEqual(final, results[1], "final grade output must match before optimization");
  }
  assert.deepEqual(results[0], results[2], "weekly grade output must match before optimization");
  console.log(`Synthetic benchmark (16 weeks, 100 peers): ${timings[0].toFixed(1)} ms -> ${timings[1].toFixed(1)} ms`);
}
console.log("student grade performance tests passed");
