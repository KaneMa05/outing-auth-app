const {
  COOKIE_NAME,
  getConfig,
  hasPermission,
  readCookie,
  readSessionToken,
  timingSafeEqualText,
} = require("./teacher-auth-utils");

const TABLE = "penalties";

module.exports = async function handler(req, res) {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  try {
    if (req.method === "DELETE") {
      if (session.role !== "admin" || !hasPermission(session, "penalties.delete")) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }

      const body = await readJson(req);
      const id = String(body.id || "").trim();
      const adminPassword = String(body.adminPassword || "");
      if (!id) {
        res.status(400).json({ ok: false, error: "missing_id" });
        return;
      }
      const { password } = getConfig();
      if (!password || !timingSafeEqualText(adminPassword, password)) {
        res.status(403).json({ ok: false, error: "invalid_admin_password" });
        return;
      }

      const rows = await requestSupabase("GET", `${TABLE}?id=eq.${encodeURIComponent(id)}&select=id,reason,deleted_at&limit=1`);
      const penalty = Array.isArray(rows) ? rows[0] : null;
      if (!penalty) {
        res.status(404).json({ ok: false, error: "not_found" });
        return;
      }
      if (penalty.deleted_at) {
        res.status(409).json({ ok: false, error: "already_deleted" });
        return;
      }
      if (!String(penalty.reason || "").trim()) {
        res.status(400).json({ ok: false, error: "missing_reason" });
        return;
      }

      const deletedAt = new Date().toISOString();
      const updated = await requestSupabase("PATCH", `${TABLE}?id=eq.${encodeURIComponent(id)}&select=*`, {
        deleted_at: deletedAt,
        deleted_by: session.username || "admin",
      }, {
        Prefer: "return=representation",
      });
      res.status(200).json({ ok: true, penalty: Array.isArray(updated) ? updated[0] : null });
      return;
    }

    res.setHeader("Allow", "DELETE");
    res.status(405).json({ ok: false });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "penalty_store_error" });
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
    const error = new Error(`supabase_${response.status}`);
    error.status = 502;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
}
