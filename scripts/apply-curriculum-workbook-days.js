const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { CURRICULUM_WORKBOOK_DAY_COUNTS } = require("./curriculum-workbook-days");

const root = path.resolve(__dirname, "..");
loadEnv(path.join(root, ".env"));
loadEnv(path.join(root, ".env.local"));

const { loadCurriculum, requestSupabase, saveSubject } = require("../api/curriculum")._private;
const applyChanges = process.argv.includes("--apply");

(async () => {
  const before = await loadCurriculum({ includeUnpublished: true });
  const managed = before.filter((subject) => CURRICULUM_WORKBOOK_DAY_COUNTS[subject.id]);
  if (managed.length !== Object.keys(CURRICULUM_WORKBOOK_DAY_COUNTS).length) {
    throw new Error(`대상 과목이 부족합니다: ${managed.length}/${Object.keys(CURRICULUM_WORKBOOK_DAY_COUNTS).length}`);
  }

  const nextSubjects = managed.map(buildWorkbookSubject);
  nextSubjects.forEach(validateSubject);
  printSummary("현재", managed);
  printSummary("변경", nextSubjects);
  if (!applyChanges) {
    console.log("검증만 완료했습니다. 실제 반영은 --apply 옵션이 필요합니다.");
    return;
  }

  const backupPath = path.join(os.tmpdir(), `outing-auth-curriculum-${Date.now()}.json`);
  fs.writeFileSync(backupPath, `${JSON.stringify(managed, null, 2)}\n`, "utf8");
  console.log(`백업: ${backupPath}`);

  for (const subject of nextSubjects) await saveSubject(subject);

  const affectedStageIds = [...new Set(managed.flatMap((subject) =>
    subject.stages.map((stage) => stage.id)
  ).concat(nextSubjects.flatMap((subject) => subject.stages.map((stage) => stage.id))))];
  if (affectedStageIds.length) {
    await requestSupabase(
      "DELETE",
      `curriculum_student_stage_progress?stage_id=in.${encodeInFilter(affectedStageIds)}`,
      undefined,
      { Prefer: "return=minimal" }
    );
  }

  const visibleAfter = await loadCurriculum({ includeUnpublished: false });
  const allAfter = await loadCurriculum({ includeUnpublished: true });
  verifyApplied(managed, visibleAfter, allAfter);
  const finalStageIds = allAfter
    .filter((subject) => CURRICULUM_WORKBOOK_DAY_COUNTS[subject.id])
    .flatMap((subject) => subject.stages.map((stage) => stage.id));
  const remainingStageProgress = finalStageIds.length
    ? await requestSupabase(
        "GET",
        `curriculum_student_stage_progress?stage_id=in.${encodeInFilter(finalStageIds)}&select=stage_id&limit=1`
      )
    : [];
  if (remainingStageProgress.length) throw new Error("기존 회차 완료 기록이 남아 있습니다.");
  printSummary("운영 반영", allAfter.filter((subject) => CURRICULUM_WORKBOOK_DAY_COUNTS[subject.id]));
  console.log("운영 커리큘럼 일차 재구성 및 검증 완료");
})().catch((error) => {
  console.error(`커리큘럼 일차 반영 실패: ${error.message}`);
  process.exitCode = 1;
});

function buildWorkbookSubject(subject) {
  const allLectures = subject.stages
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.stageNumber - b.stageNumber)
    .flatMap((stage) => stage.lectures.slice().sort((a, b) => a.sortOrder - b.sortOrder));
  const dayCounts = CURRICULUM_WORKBOOK_DAY_COUNTS[subject.id];
  const detailedCount = dayCounts.reduce((sum, count) => sum + count, 0);
  if (allLectures.length < detailedCount) {
    throw new Error(`${subject.id}: ${detailedCount}강이 필요하지만 ${allLectures.length}강만 있습니다.`);
  }

  let offset = 0;
  const stages = dayCounts.map((lectureCount, index) => {
    const lectures = allLectures.slice(offset, offset + lectureCount)
      .map((lecture, lectureIndex) => ({ ...lecture, sortOrder: lectureIndex + 1 }));
    offset += lectureCount;
    return {
      id: `${subject.id}-stage-${index + 1}`,
      stageNumber: index + 1,
      title: lectures.map((lecture) => lecture.title).join(", "),
      sortOrder: index + 1,
      isPublished: true,
      requiresWrapUp: index !== 0,
      lectures,
    };
  });
  const extras = allLectures.slice(detailedCount)
    .map((lecture, lectureIndex) => ({ ...lecture, sortOrder: lectureIndex + 1 }));
  if (extras.length) {
    stages.push({
      id: `${subject.id}-workbook-extra`,
      stageNumber: 100,
      title: "엑셀 상세표 미수록 강의",
      sortOrder: 100,
      isPublished: false,
      requiresWrapUp: false,
      lectures: extras,
    });
  }
  return { ...subject, totalStages: stages.length, stages };
}

function validateSubject(subject) {
  const expected = CURRICULUM_WORKBOOK_DAY_COUNTS[subject.id];
  const visibleStages = subject.stages.filter((stage) => stage.isPublished !== false);
  const actual = visibleStages.map((stage) => stage.lectures.length);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${subject.id}: 비고 일차 검증에 실패했습니다.`);
  }
  const lectureIds = subject.stages.flatMap((stage) => stage.lectures.map((lecture) => lecture.id));
  if (new Set(lectureIds).size !== lectureIds.length) throw new Error(`${subject.id}: 중복 강의 ID가 있습니다.`);
}

function verifyApplied(before, visibleAfter, allAfter) {
  for (const original of before) {
    const visible = visibleAfter.find((subject) => subject.id === original.id);
    const complete = allAfter.find((subject) => subject.id === original.id);
    if (!visible || !complete) throw new Error(`${original.id}: 반영 후 과목을 찾을 수 없습니다.`);
    validateSubject(complete);
    const expectedStageCount = CURRICULUM_WORKBOOK_DAY_COUNTS[original.id].length;
    if (visible.stages.length !== expectedStageCount) {
      throw new Error(`${original.id}: 학생용 회차 수가 ${visible.stages.length}/${expectedStageCount}입니다.`);
    }
    const beforeIds = original.stages.flatMap((stage) => stage.lectures.map((lecture) => lecture.id)).sort();
    const afterIds = complete.stages.flatMap((stage) => stage.lectures.map((lecture) => lecture.id)).sort();
    if (JSON.stringify(afterIds) !== JSON.stringify(beforeIds)) {
      throw new Error(`${original.id}: 강의 ID 보존 검증에 실패했습니다.`);
    }
  }
}

function printSummary(label, subjects) {
  subjects.forEach((subject) => {
    const visible = subject.stages.filter((stage) => stage.isPublished !== false);
    const visibleLectures = visible.reduce((sum, stage) => sum + stage.lectures.length, 0);
    const hiddenLectures = subject.stages.filter((stage) => stage.isPublished === false)
      .reduce((sum, stage) => sum + stage.lectures.length, 0);
    console.log(`${label} ${subject.id}: ${visible.length}회차, ${visibleLectures}강, 비공개 ${hiddenLectures}강`);
  });
}

function encodeInFilter(values) {
  return `(${values.map((value) => encodeURIComponent(String(value))).join(",")})`;
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator < 1) return;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  });
}
