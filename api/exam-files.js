const {
  COOKIE_NAME,
  getConfig,
  hasPermission,
  readCookie,
  readSessionToken,
} = require("./teacher-auth-utils");

const TABLE = "exam_files";

module.exports = async function handler(req, res) {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  if (!hasPermission(session, "grades.read")) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }

  try {
    if (req.method === "POST") {
      const body = await readJson(req);
      const files = Array.isArray(body.files) ? body.files : [];
      if (!files.length) {
        res.status(400).json({ ok: false, error: "missing_files" });
        return;
      }
      await requestSupabase("POST", `${TABLE}?on_conflict=id`, files.map(normalizeExamFile), {
        Prefer: "resolution=merge-duplicates,return=minimal",
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "DELETE") {
      const body = await readJson(req);
      const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id || "").trim()).filter(Boolean) : [];
      if (!ids.length) {
        res.status(400).json({ ok: false, error: "missing_ids" });
        return;
      }
      await requestSupabase("DELETE", `${TABLE}?id=in.(${ids.map(encodeURIComponent).join(",")})`, null, {
        Prefer: "return=minimal",
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "POST, DELETE");
    res.status(405).json({ ok: false });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "exam_file_store_error" });
  }
};

function readSession(req) {
  const { secret } = getConfig();
  return readSessionToken(readCookie(req, COOKIE_NAME), secret);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function normalizeExamFile(file) {
  return {
    id: String(file.id || "").trim(),
    exam_section_id: String(file.exam_section_id || "").trim(),
    file_type: String(file.file_type || "").trim() || "answer_pdf",
    file_path: String(file.file_path || "").trim() || null,
    file_url: String(file.file_url || "").trim() || null,
    original_name: String(file.original_name || "").trim() || null,
    uploaded_at: file.uploaded_at || new Date().toISOString(),
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
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    const error = new Error(`supabase_${response.status}${details ? `: ${details}` : ""}`);
    error.details = details;
    error.status = 502;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
}
