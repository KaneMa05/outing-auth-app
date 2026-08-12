const crypto = require("crypto");
const curriculumApi = require("./curriculum");

const { loadCurriculum, requestSupabase, isCurriculumQuestEnabled } = curriculumApi._private;
const ACTIONS = new Set(["load", "set_lecture", "set_stage_task", "complete_stage"]);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  try {
    if (!(await isCurriculumQuestEnabled())) throw httpError("curriculum_disabled", 404);
    const body = await readJson(req);
    const action = normalizeText(body.action, 40);
    if (!ACTIONS.has(action)) throw httpError("unsupported_action", 400);
    const student = await authenticateLectureStudent(body);
    if (!student) throw httpError("lecture_student_only", 403);
    const catalog = filterCatalogForTrack(await loadCurriculum(), student.track);

    if (action === "load") {
      res.status(200).json({ ok: true, subjects: catalog, progress: await loadStudentProgress(student.id, catalog) });
      return;
    }

    if (action === "set_lecture") {
      const lectureId = normalizeId(body.lectureId, "invalid_lecture_id");
      const location = findLecture(catalog, lectureId);
      if (!location) throw httpError("lecture_not_found", 404);
      const now = new Date().toISOString();
      if (body.completed === true) {
        await requestSupabase("POST", "curriculum_student_lecture_progress?on_conflict=student_id,lecture_id", {
          student_id: student.id,
          lecture_id: lectureId,
          completed_at: now,
          updated_at: now,
        }, { Prefer: "resolution=merge-duplicates,return=minimal" });
      } else {
        await requestSupabase("DELETE", `curriculum_student_lecture_progress?student_id=eq.${encodeURIComponent(student.id)}&lecture_id=eq.${encodeURIComponent(lectureId)}`);
        await clearStageCompletionFrom(student.id, location.subject, location.stageIndex);
      }
      res.status(200).json({ ok: true, progress: await loadStudentProgress(student.id, catalog) });
      return;
    }

    if (action === "set_stage_task") {
      const stageId = normalizeId(body.stageId, "invalid_stage_id");
      const location = findStage(catalog, stageId);
      if (!location) throw httpError("stage_not_found", 404);
      if (location.stage.requiresWrapUp === false) throw httpError("orientation_has_no_wrap_up", 400);
      const task = body.task === "consolidation" ? "consolidation_completed" : body.task === "mbt" ? "mbt_completed" : "";
      if (!task) throw httpError("invalid_stage_task", 400);
      const now = new Date().toISOString();
      await requestSupabase("POST", "curriculum_student_stage_progress?on_conflict=student_id,stage_id", {
        student_id: student.id,
        stage_id: stageId,
        [task]: body.completed === true,
        updated_at: now,
      }, { Prefer: "resolution=merge-duplicates,return=minimal" });
      if (body.completed !== true) await clearStageCompletionFrom(student.id, location.subject, location.stageIndex);
      res.status(200).json({ ok: true, progress: await loadStudentProgress(student.id, catalog) });
      return;
    }

    const stageId = normalizeId(body.stageId, "invalid_stage_id");
    const location = findStage(catalog, stageId);
    if (!location) throw httpError("stage_not_found", 404);
    await validateStageCompletion(student.id, location.subject, location.stageIndex);
    const now = new Date().toISOString();
    await requestSupabase("POST", "curriculum_student_stage_progress?on_conflict=student_id,stage_id", {
      student_id: student.id,
      stage_id: stageId,
      stage_completed_at: now,
      updated_at: now,
    }, { Prefer: "resolution=merge-duplicates,return=minimal" });
    res.status(200).json({ ok: true, progress: await loadStudentProgress(student.id, catalog) });
  } catch (error) {
    if (!error.status || error.status >= 500) console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "curriculum_progress_error" });
  }
};

async function authenticateLectureStudent(body) {
  const studentId = normalizeText(body.studentId, 64);
  const deviceToken = normalizeText(body.deviceToken, 256);
  if (!studentId || !deviceToken) return null;
  const validation = await requestSupabase("POST", "rpc/validate_student_device", {
    p_student_id: studentId,
    p_device_token_hash: hashDeviceToken(deviceToken),
    p_client_display_mode: normalizeText(body.client?.displayMode, 40) || null,
    p_client_user_agent: normalizeText(body.client?.userAgent, 500) || null,
  });
  if (!validation || validation.valid !== true) return null;
  const rows = await requestSupabase(
    "GET",
    `students?id=eq.${encodeURIComponent(studentId)}&student_category=eq.lecture&is_active=eq.true&select=id,name,track,student_category&limit=1`
  );
  return rows?.[0] || null;
}

function filterCatalogForTrack(subjects, studentTrack) {
  const track = normalizeText(studentTrack, 100);
  return (Array.isArray(subjects) ? subjects : []).filter((subject) => {
    const targets = Array.isArray(subject.targetTracks) ? subject.targetTracks.map((item) => normalizeText(item, 100)) : [];
    return targets.includes("*") || targets.includes(track);
  });
}

async function loadStudentProgress(studentId, catalog) {
  const lectureIds = catalog.flatMap((subject) => subject.stages.flatMap((stage) => stage.lectures.map((lecture) => lecture.id)));
  const stageIds = catalog.flatMap((subject) => subject.stages.map((stage) => stage.id));
  const [lectureRows, stageRows] = await Promise.all([
    lectureIds.length
      ? requestSupabase("GET", `curriculum_student_lecture_progress?student_id=eq.${encodeURIComponent(studentId)}&lecture_id=in.${encodeInFilter(lectureIds)}&select=lecture_id,completed_at`)
      : [],
    stageIds.length
      ? requestSupabase("GET", `curriculum_student_stage_progress?student_id=eq.${encodeURIComponent(studentId)}&stage_id=in.${encodeInFilter(stageIds)}&select=stage_id,consolidation_completed,mbt_completed,stage_completed_at`)
      : [],
  ]);
  return {
    lectureIds: (lectureRows || []).map((row) => row.lecture_id),
    stages: (stageRows || []).map((row) => ({
      stageId: row.stage_id,
      consolidation: row.consolidation_completed === true,
      mbt: row.mbt_completed === true,
      completed: Boolean(row.stage_completed_at),
    })),
  };
}

async function validateStageCompletion(studentId, subject, stageIndex) {
  if (stageIndex > 0) {
    const previousStage = subject.stages[stageIndex - 1];
    const previousRows = await requestSupabase(
      "GET",
      `curriculum_student_stage_progress?student_id=eq.${encodeURIComponent(studentId)}&stage_id=eq.${encodeURIComponent(previousStage.id)}&stage_completed_at=not.is.null&select=stage_id&limit=1`
    );
    if (!previousRows?.[0]) throw httpError("previous_stage_incomplete", 409);
  }
  const stage = subject.stages[stageIndex];
  const lectureIds = stage.lectures.map((lecture) => lecture.id);
  const lectureRows = lectureIds.length
    ? await requestSupabase(
        "GET",
        `curriculum_student_lecture_progress?student_id=eq.${encodeURIComponent(studentId)}&lecture_id=in.${encodeInFilter(lectureIds)}&select=lecture_id`
      )
    : [];
  if ((lectureRows || []).length !== lectureIds.length) throw httpError("lectures_incomplete", 409);
  if (stage.requiresWrapUp !== false) {
    const stageRows = await requestSupabase(
      "GET",
      `curriculum_student_stage_progress?student_id=eq.${encodeURIComponent(studentId)}&stage_id=eq.${encodeURIComponent(stage.id)}&select=consolidation_completed,mbt_completed&limit=1`
    );
    if (!stageRows?.[0]?.consolidation_completed || !stageRows?.[0]?.mbt_completed) throw httpError("wrap_up_incomplete", 409);
  }
}

async function clearStageCompletionFrom(studentId, subject, stageIndex) {
  const stageIds = subject.stages.slice(stageIndex).map((stage) => stage.id);
  if (!stageIds.length) return;
  await requestSupabase(
    "PATCH",
    `curriculum_student_stage_progress?student_id=eq.${encodeURIComponent(studentId)}&stage_id=in.${encodeInFilter(stageIds)}`,
    { stage_completed_at: null, updated_at: new Date().toISOString() },
    { Prefer: "return=minimal" }
  );
}

function findStage(catalog, stageId) {
  for (const subject of catalog) {
    const stageIndex = subject.stages.findIndex((stage) => stage.id === stageId);
    if (stageIndex >= 0) return { subject, stage: subject.stages[stageIndex], stageIndex };
  }
  return null;
}

function findLecture(catalog, lectureId) {
  for (const subject of catalog) {
    for (let stageIndex = 0; stageIndex < subject.stages.length; stageIndex += 1) {
      const stage = subject.stages[stageIndex];
      if (stage.lectures.some((lecture) => lecture.id === lectureId)) return { subject, stage, stageIndex };
    }
  }
  return null;
}

function encodeInFilter(values) {
  return `(${values.map((value) => encodeURIComponent(String(value))).join(",")})`;
}

function normalizeId(value, errorCode) {
  const id = normalizeText(value, 100);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) throw httpError(errorCode, 400);
  return id;
}

function normalizeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function hashDeviceToken(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports._test = { filterCatalogForTrack, findStage, findLecture };
