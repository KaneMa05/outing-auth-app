const {
  COOKIE_NAME,
  getConfig,
  hasPermission,
  readCookie,
  readSessionToken,
} = require("./teacher-auth-utils");

const TABLE = "managers";

module.exports = async function handler(req, res) {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  try {
    if (req.method === "GET") {
      if (!hasPermission(session, "managers.read")) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }
      const managers = await requestSupabase("GET", `${TABLE}?is_active=eq.true&select=id,name,role,memo,is_active,created_at&order=created_at.asc`);
      res.status(200).json({ ok: true, managers });
      return;
    }

    if (req.method === "POST") {
      if (!hasPermission(session, "managers.write")) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }
      const body = await readJson(req);
      const managers = Array.isArray(body.managers) ? body.managers : [];
      if (!managers.length) {
        res.status(400).json({ ok: false, error: "missing_managers" });
        return;
      }
      await requestSupabase("POST", `${TABLE}?on_conflict=id`, managers.map(normalizeManager), {
        Prefer: "resolution=merge-duplicates,return=minimal",
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "DELETE") {
      if (!hasPermission(session, "managers.write")) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }
      const body = await readJson(req);
      const id = String(body.id || "").trim();
      if (!id) {
        res.status(400).json({ ok: false, error: "missing_id" });
        return;
      }
      await requestSupabase("PATCH", `${TABLE}?id=eq.${encodeURIComponent(id)}`, { is_active: false }, {
        Prefer: "return=minimal",
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    res.status(405).json({ ok: false });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "manager_store_error" });
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

function normalizeManager(manager) {
  return {
    id: String(manager.id || "").trim(),
    name: String(manager.name || "").trim(),
    role: String(manager.role || "").trim() || null,
    memo: String(manager.memo || "").trim() || null,
    is_active: manager.is_active !== false,
    created_at: manager.created_at || new Date().toISOString(),
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
    const error = new Error(`supabase_${response.status}`);
    error.status = 502;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
}
