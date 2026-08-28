const {
  COOKIE_NAME,
  getConfig,
  hasPermission,
  readCookie,
  readSessionToken,
} = require("./teacher-auth-utils");

const APP_SETTINGS_NOTICE_ID = "__app_settings__";

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const admin = String(req.query?.admin || "") === "1";
      if (admin) {
        requireTeacher(req, "curriculum.read");
      } else if (!(await isCurriculumQuestEnabled())) {
        res.status(200).json({ ok: true, enabled: false, subjects: [] });
        return;
      }
      const subjects = await loadCurriculum({ includeUnpublished: admin });
      res.status(200).json({ ok: true, enabled: admin ? undefined : true, subjects });
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      res.status(405).json({ ok: false, error: "method_not_allowed" });
      return;
    }

    requireTeacher(req, "curriculum.write");
    const body = await readJson(req);
    const action = String(body.action || "").trim();
    if (action === "save_subject") {
      const subject = normalizeSubject(body.subject);
      await saveSubject(subject);
      res.status(200).json({ ok: true, subject });
      return;
    }
    if (action === "delete_subject") {
      const subjectId = normalizeId(body.subjectId, "invalid_subject_id");
      await requestSupabase("PATCH", `curriculum_subjects?id=eq.${encodeURIComponent(subjectId)}`, {
        is_archived: true,
        is_published: false,
        updated_at: new Date().toISOString(),
      }, { Prefer: "return=minimal" });
      res.status(200).json({ ok: true });
      return;
    }
    res.status(400).json({ ok: false, error: "unsupported_action" });
  } catch (error) {
    if (!error.status || error.status >= 500) console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "curriculum_error" });
  }
};

async function loadCurriculum({ includeUnpublished = false } = {}) {
  const subjectFilter = includeUnpublished ? "" : "&is_published=eq.true";
  const subjects = await requestSupabase(
    "GET",
    `curriculum_subjects?is_archived=eq.false${subjectFilter}&select=id,name,short_name,tone,target_tracks,sort_order,is_published&order=sort_order.asc,id.asc`
  );
  if (!Array.isArray(subjects) || !subjects.length) return [];
  const subjectIds = subjects.map((item) => item.id);
  const stages = await requestSupabase(
    "GET",
    `curriculum_stages?subject_id=in.${encodeInFilter(subjectIds)}&select=id,subject_id,stage_number,title,sort_order,is_published,requires_wrap_up&order=sort_order.asc,stage_number.asc`
  );
  const visibleStages = includeUnpublished ? stages : (stages || []).filter((stage) => stage.is_published !== false);
  const stageIds = (visibleStages || []).map((item) => item.id);
  const lectures = stageIds.length
    ? await requestSupabase(
        "GET",
        `curriculum_lectures?stage_id=in.${encodeInFilter(stageIds)}&select=id,stage_id,lecture_number,title,sort_order&order=sort_order.asc,id.asc`
      )
    : [];

  return subjects.map((subject) => {
    const subjectStages = (visibleStages || []).filter((stage) => stage.subject_id === subject.id);
    return {
      id: subject.id,
      name: subject.name,
      shortName: subject.short_name,
      tone: subject.tone,
      targetTracks: Array.isArray(subject.target_tracks) ? subject.target_tracks : [],
      sortOrder: subject.sort_order,
      isPublished: subject.is_published !== false,
      totalStages: subjectStages.length,
      stages: subjectStages.map((stage) => {
        const stageLectures = (lectures || []).filter((lecture) => lecture.stage_id === stage.id).map((lecture) => ({
          id: lecture.id,
          no: lecture.lecture_number,
          title: lecture.title,
          sortOrder: lecture.sort_order,
        }));
        return {
          id: stage.id,
          stageNumber: stage.stage_number,
          title: String(stage.title || "").trim() || deriveCurriculumStageTitle(stageLectures),
          sortOrder: stage.sort_order,
          isPublished: stage.is_published !== false,
          requiresWrapUp: stage.requires_wrap_up !== false,
          lectures: stageLectures,
        };
      }),
    };
  });
}

async function isCurriculumQuestEnabled() {
  const rows = await requestSupabase(
    "GET",
    `notices?id=eq.${encodeURIComponent(APP_SETTINGS_NOTICE_ID)}&select=body&limit=1`
  );
  const body = Array.isArray(rows) && rows[0]?.body ? rows[0].body : "{}";
  try {
    return JSON.parse(body).curriculumQuestEnabled === true;
  } catch {
    return false;
  }
}

async function saveSubject(subject) {
  const now = new Date().toISOString();
  await requestSupabase("POST", "curriculum_subjects?on_conflict=id", {
    id: subject.id,
    name: subject.name,
    short_name: subject.shortName,
    tone: subject.tone,
    target_tracks: subject.targetTracks,
    sort_order: subject.sortOrder,
    is_published: subject.isPublished,
    is_archived: false,
    updated_at: now,
  }, { Prefer: "resolution=merge-duplicates,return=minimal" });

  const existingStages = await requestSupabase(
    "GET",
    `curriculum_stages?subject_id=eq.${encodeURIComponent(subject.id)}&select=id`
  );
  const existingStageIds = (existingStages || []).map((item) => item.id);
  const existingLectures = existingStageIds.length
    ? await requestSupabase("GET", `curriculum_lectures?stage_id=in.${encodeInFilter(existingStageIds)}&select=id`)
    : [];

  if (subject.stages.length) {
    await requestSupabase("POST", "curriculum_stages?on_conflict=id", subject.stages.map((stage) => ({
      id: stage.id,
      subject_id: subject.id,
      stage_number: stage.stageNumber,
      title: stage.title,
      sort_order: stage.sortOrder,
      is_published: stage.isPublished,
      requires_wrap_up: stage.requiresWrapUp !== false,
      updated_at: now,
    })), { Prefer: "resolution=merge-duplicates,return=minimal" });
  }

  const lectureRows = subject.stages.flatMap((stage) => stage.lectures.map((lecture) => ({
    id: lecture.id,
    stage_id: stage.id,
    lecture_number: lecture.no,
    title: lecture.title,
    sort_order: lecture.sortOrder,
    updated_at: now,
  })));
  if (lectureRows.length) {
    await requestSupabase("POST", "curriculum_lectures?on_conflict=id", lectureRows, {
      Prefer: "resolution=merge-duplicates,return=minimal",
    });
  }

  const nextLectureIds = new Set(lectureRows.map((item) => item.id));
  const removedLectureIds = (existingLectures || []).map((item) => item.id).filter((id) => !nextLectureIds.has(id));
  if (removedLectureIds.length) {
    await requestSupabase("DELETE", `curriculum_lectures?id=in.${encodeInFilter(removedLectureIds)}`);
  }
  const nextStageIds = new Set(subject.stages.map((item) => item.id));
  const removedStageIds = existingStageIds.filter((id) => !nextStageIds.has(id));
  if (removedStageIds.length) {
    await requestSupabase("DELETE", `curriculum_stages?id=in.${encodeInFilter(removedStageIds)}`);
  }
}

function normalizeSubject(value) {
  if (!value || typeof value !== "object") throw httpError("invalid_subject", 400);
  const id = normalizeId(value.id, "invalid_subject_id");
  const name = normalizeText(value.name, 60, 1, "invalid_subject_name");
  const shortName = normalizeText(value.shortName, 12, 1, "invalid_short_name");
  const tone = ["indigo", "teal", "violet"].includes(value.tone) ? value.tone : "indigo";
  const targetTracks = [...new Set((Array.isArray(value.targetTracks) ? value.targetTracks : ["경찰직 - 공채(순경)"])
    .map((track) => normalizeText(track, 100, 1, "invalid_target_track")))]
    .slice(0, 50);
  const stages = Array.isArray(value.stages) ? value.stages.slice(0, 100).map((stage, index) => {
    const stageId = normalizeId(stage.id || `${id}-stage-${index + 1}`, "invalid_stage_id");
    const lectures = (Array.isArray(stage.lectures) ? stage.lectures : []).slice(0, 300).map((lecture, lectureIndex) => ({
      id: normalizeId(lecture.id || `${stageId}-lecture-${lectureIndex + 1}`, "invalid_lecture_id"),
      no: normalizeText(lecture.no || `${lectureIndex + 1}강`, 30, 1, "invalid_lecture_number"),
      title: normalizeText(lecture.title, 240, 1, "invalid_lecture_title"),
      sortOrder: lectureIndex + 1,
    }));
    return {
      id: stageId,
      stageNumber: index + 1,
      title: normalizeText(stage.title || deriveCurriculumStageTitle(lectures), 1000, 1, "invalid_stage_title"),
      sortOrder: index + 1,
      isPublished: stage.isPublished !== false,
      requiresWrapUp: stage.requiresWrapUp !== false,
      lectures,
    };
  }) : [];
  return {
    id,
    name,
    shortName,
    tone,
    targetTracks,
    sortOrder: Math.max(1, Math.min(999, Number(value.sortOrder) || 1)),
    isPublished: value.isPublished !== false,
    totalStages: stages.length,
    stages,
  };
}

function deriveCurriculumStageTitle(lectures, fallback = "") {
  const title = (Array.isArray(lectures) ? lectures : [])
    .map((lecture) => String(lecture?.title || "").trim())
    .filter(Boolean)
    .join(", ");
  return title || String(fallback || "").trim();
}

function normalizeId(value, errorCode) {
  const id = String(value || "").trim().slice(0, 100);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) throw httpError(errorCode, 400);
  return id;
}

function normalizeText(value, maxLength, minLength, errorCode) {
  const text = String(value || "").trim().slice(0, maxLength);
  if (text.length < minLength) throw httpError(errorCode, 400);
  return text;
}

function requireTeacher(req, permission) {
  const { secret } = getConfig();
  const session = readSessionToken(readCookie(req, COOKIE_NAME), secret);
  if (!session) throw httpError("unauthorized", 401);
  if (!hasPermission(session, permission)) throw httpError("forbidden", 403);
  return session;
}

async function requestSupabase(method, path, body, extraHeaders = {}) {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) throw httpError("service_role_not_configured", 503);
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const error = httpError(detail.message || "curriculum_store_unavailable", response.status === 404 ? 503 : 502);
    error.storeStatus = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

function encodeInFilter(values) {
  return `(${values.map((value) => encodeURIComponent(String(value))).join(",")})`;
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

module.exports._test = { normalizeSubject, encodeInFilter };
module.exports._private = { loadCurriculum, requestSupabase, isCurriculumQuestEnabled };
