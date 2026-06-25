const {
  COOKIE_NAME,
  getConfig,
  hasPermission,
  readCookie,
  readSessionToken,
} = require("./teacher-auth-utils");

const TABLE = "exam_answers";

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
    if (req.method === "DELETE") {
      const body = await readJson(req);
      const sectionIds = normalizeIds(body.sectionIds);
      const ids = normalizeIds(body.ids);
      if (!sectionIds.length && !ids.length) {
        res.status(400).json({ ok: false, error: "missing_targets" });
        return;
      }
      if (sectionIds.length) {
        await requestSupabase("DELETE", `${TABLE}?exam_section_id=in.(${sectionIds.map(encodeURIComponent).join(",")})`, null, {
          Prefer: "return=minimal",
        });
      }
      if (ids.length) {
        await requestSupabase("DELETE", `${TABLE}?id=in.(${ids.map(encodeURIComponent).join(",")})`, null, {
          Prefer: "return=minimal",
        });
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "DELETE");
    res.status(405).json({ ok: false });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "exam_answer_delete_error" });
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

function normalizeIds(values) {
  return Array.isArray(values)
    ? values.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
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
