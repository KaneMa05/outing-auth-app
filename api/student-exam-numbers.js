const {
  COOKIE_NAME,
  getConfig,
  hasPermission,
  readCookie,
  readSessionToken,
} = require("./teacher-auth-utils");

const STUDENT_TABLE = "students";
const EXAM_NUMBER_TABLE = "student_exam_numbers";
const MAX_EXAM_NUMBER_LENGTH = 50;

module.exports = async function handler(req, res) {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  const requiredPermission = req.method === "GET" ? "exam_numbers.read" : "exam_numbers.write";
  if (!hasPermission(session, requiredPermission)) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }

  try {
    if (req.method === "GET") {
      const [students, examNumbers] = await Promise.all([
        loadActiveOfflineStudents(),
        requestSupabase(
          "GET",
          `${EXAM_NUMBER_TABLE}?select=student_id,exam_number,updated_at&order=student_id.asc`
        ),
      ]);
      res.status(200).json({
        ok: true,
        students: (students || []).map(mapStudent),
        examNumbers: (examNumbers || []).map(mapExamNumber),
      });
      return;
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const entries = normalizeEntries(body.entries);
      if (!entries.length) {
        res.status(400).json({ ok: false, error: "missing_entries" });
        return;
      }

      const students = await loadActiveOfflineStudents();
      const eligibleIds = new Set((students || []).map((student) => String(student.id)));
      if (entries.some((entry) => !eligibleIds.has(entry.studentId))) {
        res.status(400).json({ ok: false, error: "ineligible_student" });
        return;
      }

      const savedAt = new Date().toISOString();
      const rowsToUpsert = entries
        .filter((entry) => entry.examNumber)
        .map((entry) => ({
          student_id: entry.studentId,
          exam_number: entry.examNumber,
          updated_by: String(session.username || "admin").slice(0, 100),
          updated_at: savedAt,
        }));
      const idsToDelete = entries
        .filter((entry) => !entry.examNumber)
        .map((entry) => entry.studentId);

      if (rowsToUpsert.length) {
        await requestSupabase(
          "POST",
          `${EXAM_NUMBER_TABLE}?on_conflict=student_id`,
          rowsToUpsert,
          { Prefer: "resolution=merge-duplicates,return=minimal" }
        );
      }
      for (const studentId of idsToDelete) {
        await requestSupabase(
          "DELETE",
          `${EXAM_NUMBER_TABLE}?student_id=eq.${encodeURIComponent(studentId)}`,
          null,
          { Prefer: "return=minimal" }
        );
      }

      res.status(200).json({
        ok: true,
        savedAt,
        entries: entries.map((entry) => ({
          studentId: entry.studentId,
          examNumber: entry.examNumber,
          updatedAt: entry.examNumber ? savedAt : "",
        })),
      });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      ok: false,
      error: error.message || "student_exam_number_store_error",
    });
  }
};

function readSession(req) {
  const { secret } = getConfig();
  return readSessionToken(readCookie(req, COOKIE_NAME), secret);
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function normalizeEntries(value) {
  if (!Array.isArray(value)) return [];
  const entriesByStudent = new Map();
  for (const item of value) {
    const studentId = String(item?.studentId || "").trim();
    const examNumber = normalizeExamNumber(item?.examNumber);
    if (!studentId) continue;
    if (examNumber.length > MAX_EXAM_NUMBER_LENGTH) {
      const error = new Error("invalid_exam_number");
      error.status = 400;
      throw error;
    }
    entriesByStudent.set(studentId, { studentId, examNumber });
  }
  return [...entriesByStudent.values()];
}

function normalizeExamNumber(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

async function loadActiveOfflineStudents() {
  return requestSupabase(
    "GET",
    `${STUDENT_TABLE}?student_category=eq.offline&account_type=eq.student&is_active=eq.true&select=id,name,cohort,track&order=cohort.desc,id.asc`
  );
}

function mapStudent(row) {
  return {
    id: String(row.id || ""),
    name: String(row.name || ""),
    cohort: row.cohort == null ? "" : String(row.cohort),
    track: String(row.track || ""),
  };
}

function mapExamNumber(row) {
  return {
    studentId: String(row.student_id || ""),
    examNumber: String(row.exam_number || ""),
    updatedAt: row.updated_at || "",
  };
}

async function requestSupabase(method, path, body, extraHeaders = {}) {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error("service_role_not_configured");
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const missingTable = response.status === 404 || /student_exam_numbers|schema cache|relation/i.test(detail);
    const error = new Error(missingTable ? "exam_number_table_unavailable" : `supabase_${response.status}`);
    error.status = missingTable ? 503 : 502;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

module.exports._private = {
  normalizeEntries,
  normalizeExamNumber,
};
