const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const localCurriculumPath = path.join(root, ".local-curriculum.json");
const localSettingsPath = path.join(root, ".local-app-settings.json");
const localStatePath = path.join(root, ".local-dev-state.json");

loadEnv(path.join(root, ".env"));
loadEnv(path.join(root, ".env.local"));

const curriculumApi = require("../api/curriculum");
const { restructureCurriculumIntoSessions } = require("./curriculum-sessions");

(async () => {
  const managedSubjects = await curriculumApi._private.loadCurriculum({ includeUnpublished: true });
  const subjects = restructureCurriculumIntoSessions(managedSubjects);
  if (!Array.isArray(subjects) || subjects.length === 0) {
    throw new Error("Supabase에서 커리큘럼을 찾지 못했습니다.");
  }

  const currentSettings = readJson(localSettingsPath, {});
  const nextSettings = {
    ...currentSettings,
    curriculumQuestEnabled: true,
  };

  fs.writeFileSync(localCurriculumPath, `${JSON.stringify(subjects, null, 2)}\n`, "utf8");
  fs.writeFileSync(localSettingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf8");
  const localState = readJson(localStatePath, null);
  if (localState) {
    localState.settings = { ...(localState.settings || {}), curriculumQuestEnabled: true };
    fs.writeFileSync(localStatePath, `${JSON.stringify(localState, null, 2)}\n`, "utf8");
  }

  const stageCount = subjects.reduce((sum, subject) => sum + (subject.stages?.length || 0), 0);
  const lectureCount = subjects.reduce(
    (sum, subject) => sum + (subject.stages || []).reduce((stageSum, stage) => stageSum + (stage.lectures?.length || 0), 0),
    0
  );
  console.log(`로컬 커리큘럼 준비 완료: ${subjects.length}과목, ${stageCount}단계, ${lectureCount}강`);
  console.log("운영 기능 플래그는 변경하지 않았습니다.");
  console.log("실행: npm run dev:local");
})().catch((error) => {
  console.error(`로컬 커리큘럼 준비 실패: ${error.message}`);
  process.exitCode = 1;
});

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator < 1) return;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  });
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8") || "null");
    return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
