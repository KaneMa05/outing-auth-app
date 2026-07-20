const assert = require("node:assert/strict");
const fs = require("node:fs");

const appSource = fs.readFileSync("app.js", "utf8");
const sharedSource = fs.readFileSync("shared.js", "utf8");
const teacherSource = fs.readFileSync("teacher-students.js", "utf8");
const studentResetApiSource = fs.readFileSync("api/student-reset-registration.js", "utf8");
const teacherResetApiSource = fs.readFileSync("api/reset-student-registration.js", "utf8");

assert.match(appSource, /await registerStudentDeviceWithServer\(/);
assert.match(appSource, /registration\.error === "device_limit_reached"/);
assert.match(appSource, /saveState\(\{ skipRemote: true \}\);/);
assert.doesNotMatch(
  appSource.match(/form\.addEventListener\("submit"[\s\S]*?return el\("div", \{ className: "grid student-view"/)?.[0] || "",
  /addStudentRegistrationEvent/,
  "the client must not duplicate the registration event written by the server"
);

assert.match(sharedSource, /async function reconcileCurrentStudentDeviceWithServer/);
assert.match(sharedSource, /response\.status !== 403 \|\| data\.error !== "device_not_active"/);
assert.match(sharedSource, /console\.warn\("Student device validation was skipped\."/);
assert.match(sharedSource, /delete state\.settings\.studentProfiles\[studentId\]/);
assert.match(appSource, /async function openStudentDeviceManager/);
assert.match(appSource, /async function revokeStudentDevice/);
assert.match(teacherSource, /async function openTeacherStudentDeviceManager/);
assert.match(teacherSource, /async function revokeTeacherStudentDevice/);
assert.match(studentResetApiSource, /rpc\/reset_student_devices/);
assert.match(teacherResetApiSource, /rpc\/reset_student_devices/);
assert.match(
  sharedSource,
  /if \(APP_MODE !== "student"\) \{\s*const registeredStudents/,
  "student saves must not rewrite the legacy students.device_token field"
);

const validationFunctionSource = sharedSource
  .match(/async function reconcileCurrentStudentDeviceWithServer\([\s\S]*?\n}\n\nfunction hasActiveStudentExamDraft/)?.[0]
  .replace(/\n\nfunction hasActiveStudentExamDraft[\s\S]*$/, "");
assert.ok(validationFunctionSource, "student device validation function should be available");

function createValidator(state, fetchImpl) {
  const getStudentProfile = (studentId) => state.settings.studentProfiles[studentId];
  const fakeConsole = { warn() {} };
  return new Function(
    "state",
    "getStudentProfile",
    "fetch",
    "console",
    "navigator",
    "isStandaloneStudentApp",
    `const APP_MODE = "student";
     const STUDENT_DEVICE_VALIDATION_INTERVAL_MS = 300000;
     let studentDeviceValidationAttemptedAt = 0;
     ${validationFunctionSource};
     return reconcileCurrentStudentDeviceWithServer;`
  )(
    state,
    getStudentProfile,
    fetchImpl,
    fakeConsole,
    { userAgent: "test-agent" },
    () => true
  );
}

function createAuthState() {
  return {
    settings: {
      studentAuthId: "18001",
      lastStudentId: "18001",
      studentProfiles: {
        "18001": { deviceToken: "device-token" },
      },
    },
  };
}

(async () => {
  const networkState = createAuthState();
  const networkValidator = createValidator(networkState, async () => {
    throw new Error("offline");
  });
  assert.equal(await networkValidator({ force: true }), false);
  assert.ok(networkState.settings.studentProfiles["18001"], "network failures must preserve local auth");

  const validState = createAuthState();
  const validValidator = createValidator(validState, async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, valid: true, deviceId: "device-1", activeCount: 2 }),
  }));
  assert.equal(await validValidator({ force: true }), false);
  assert.equal(validState.settings.studentProfiles["18001"].deviceId, "device-1");
  assert.equal(validState.settings.studentProfiles["18001"].deviceActiveCount, 2);

  const revokedState = createAuthState();
  const revokedValidator = createValidator(revokedState, async () => ({
    ok: false,
    status: 403,
    json: async () => ({ ok: false, error: "device_not_active" }),
  }));
  assert.equal(await revokedValidator({ force: true }), true);
  assert.equal(revokedState.settings.studentAuthId, "");
  assert.equal(revokedState.settings.studentProfiles["18001"], undefined);

  console.log("student device client tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
