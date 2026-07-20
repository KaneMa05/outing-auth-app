const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("shared.js", "utf8");
const peerFunctionSource = source.match(/function getStudentRemotePeerIds\([\s\S]*?\n}\n\nasync function loadStudentGradesRefreshSnapshot/)?.[0]
  .replace(/\n\nasync function loadStudentGradesRefreshSnapshot[\s\S]*$/, "");
const snapshotFunctionSource = source.match(/function applyStudentGradesRefreshSnapshot\([\s\S]*?\n}\n\nasync function refreshStudentGradesStateFromRemote/)?.[0]
  .replace(/\n\nasync function refreshStudentGradesStateFromRemote[\s\S]*$/, "");

assert.ok(peerFunctionSource, "getStudentRemotePeerIds source should be available");
assert.ok(snapshotFunctionSource, "applyStudentGradesRefreshSnapshot source should be available");
assert.match(
  source,
  /if \(!submissionAnswerResult\.error && !submissionAnswerResult\.skipped\) state\.submissionAnswers/,
  "a skipped answer query must preserve cached submission answers"
);
assert.match(
  source,
  /if \(!examResult\.error && !examResult\.skipped\) state\.exams/,
  "cached exam data must not be replaced by a skipped query"
);
assert.match(
  source,
  /catch \(error\) \{\s*studentExamDataLastLoadedAt = 0;\s*console\.error\("Failed to refresh student grade data"/,
  "a scoped refresh failure must force the next cycle back to a full refresh"
);
assert.match(
  source,
  /const shouldLoadLegacyStudentGradeData = APP_MODE === "student" && scopedStudentId && !STUDENT_SCOPED_REFRESH_ENABLED/,
  "the emergency switch must restore the legacy student grade queries"
);
assert.match(
  source,
  /if \(APP_MODE === "student" && scopedStudentId && STUDENT_SCOPED_REFRESH_ENABLED\)/,
  "student query scoping must be disabled by the emergency switch"
);
assert.match(
  source,
  /const snapshot = await loadStudentGradesRefreshSnapshot\(scopedStudentId\);\s*if \(hasActiveStudentExamDraft\(\)\) return false;/,
  "a late scoped response must not overwrite an active answer draft"
);
assert.match(
  source,
  /const preserveActiveExamState = hasActiveStudentExamDraft\(\);[\s\S]*if \(!preserveActiveExamState\) \{[\s\S]*state\.examSubmissions/,
  "a late full response must preserve active submission state"
);
assert.match(
  source,
  /if \(studentExamDraft\?\.saving\) return true;\s*return currentRoute === "grades" && Boolean\(studentExamDraft\?\.sectionId\);/,
  "saving must remain protected even if the student navigates away from the grade route"
);
assert.match(
  source,
  /function scheduleStudentLocalSnapshotSave\(\)[\s\S]*requestIdleCallback\(saveSnapshot, \{ timeout: 5000 \}\)/,
  "background snapshots should be deferred to browser idle time"
);
assert.match(
  source,
  /if \(hasActiveStudentExamDraft\(\) \|\| isRemoteSaving \|\| hasPendingRemoteSave\) return;\s*saveStateToLocalStorage\(\);/,
  "background snapshots must not serialize state while answers or remote writes are active"
);

function getStudentCohort(student) {
  const id = String(student?.id || "").trim();
  return /^\d{4,}$/.test(id) ? id.slice(0, -3) : "";
}

function normalizeCoastGuardTrack(track) {
  return String(track || "").trim().toLowerCase();
}

function createPeerSelector(state) {
  return new Function(
    "state",
    "getStudentCohort",
    "normalizeCoastGuardTrack",
    `${peerFunctionSource}; return getStudentRemotePeerIds;`
  )(state, getStudentCohort, normalizeCoastGuardTrack);
}

const students = [
  { id: "18001", track: "old-track" },
  { id: "18002", track: "new-track" },
  { id: "18003", track: "old-track" },
  { id: "19001", track: "new-track" },
];

const selectorWithLocalProfile = createPeerSelector({
  settings: {
    studentProfiles: {
      "18001": { track: "new-track" },
    },
  },
});

assert.deepEqual(
  selectorWithLocalProfile(students, "18001"),
  ["18001", "18003"],
  "weekly-grade peers must follow the same roster-track priority used by the grade calculation"
);

assert.deepEqual(
  selectorWithLocalProfile(students, "18001", { matchTrack: false }),
  ["18001", "18002", "18003"],
  "cohort-scoped fitness data must include every student in the same cohort"
);

const selectorWithoutLocalProfile = createPeerSelector({ settings: { studentProfiles: {} } });

assert.deepEqual(
  selectorWithoutLocalProfile(students, "18001"),
  ["18001", "18003"],
  "server track should be used when no local profile track exists"
);

assert.deepEqual(
  selectorWithLocalProfile(students, "18001", { currentTrack: "new-track" }),
  ["18001", "18002"],
  "an explicit track override should still be honored while keeping the current student included"
);

assert.deepEqual(
  selectorWithoutLocalProfile(students, "99999"),
  ["99999"],
  "a missing roster entry must fall back to the scoped student only"
);

function createSnapshotApplier(state) {
  return new Function("state", `${snapshotFunctionSource}; return applyStudentGradesRefreshSnapshot;`)(state);
}

const gradeState = {
  examSubmissions: ["existing-submission"],
  submissionAnswers: ["existing-answer"],
  finalExamScores: ["existing-final-score"],
  fitnessScores: ["existing-fitness-score"],
};
const applySnapshot = createSnapshotApplier(gradeState);

assert.equal(applySnapshot(null), false, "a missing snapshot must not change state");
assert.deepEqual(gradeState.submissionAnswers, ["existing-answer"]);

assert.equal(applySnapshot({
  examSubmissions: [],
  submissionAnswers: null,
  finalExamScores: ["new-final-score"],
  fitnessScores: null,
}), true);
assert.deepEqual(gradeState.examSubmissions, [], "an explicit empty result should clear that dataset");
assert.deepEqual(gradeState.submissionAnswers, ["existing-answer"], "an unavailable result must preserve cached answers");
assert.deepEqual(gradeState.finalExamScores, ["new-final-score"]);
assert.deepEqual(gradeState.fitnessScores, ["existing-fitness-score"], "an unavailable result must preserve cached fitness data");

console.log("refresh safety tests passed");
