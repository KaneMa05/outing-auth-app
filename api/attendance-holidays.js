const {
  COOKIE_NAME,
  getConfig,
  readCookie,
  readSessionToken,
} = require("./teacher-auth-utils");

const TABLE = "attendance_holidays";

module.exports = async function handler(req, res) {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  if (session.role !== "admin") {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }

  try {
    if (req.method === "POST") {
      const body = await readJson(req);
      const holidays = Array.isArray(body.holidays)
        ? body.holidays
        : body.holiday
          ? [body.holiday]
          : [];
      const rows = holidays.map(normalizeHoliday).filter(Boolean);
      if (!rows.length) {
        res.status(400).json({ ok: false, error: "missing_holidays" });
        return;
      }

      await requestSupabase("POST", `${TABLE}?on_conflict=date_key`, rows, {
        Prefer: "resolution=merge-duplicates,return=minimal",
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "DELETE") {
      const body = await readJson(req);
      const dateKey = String(body.dateKey || body.date_key || "").trim();
      if (!isValidDateKey(dateKey)) {
        res.status(400).json({ ok: false, error: "invalid_date_key" });
        return;
      }

      await requestSupabase("DELETE", `${TABLE}?date_key=eq.${encodeURIComponent(dateKey)}`, null, {
        Prefer: "return=minimal",
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "POST, DELETE");
    res.status(405).json({ ok: false });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "attendance_holiday_store_error" });
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

function normalizeHoliday(holiday) {
  const dateKey = String(holiday?.dateKey || holiday?.date_key || "").trim();
  if (!isValidDateKey(dateKey)) return null;
  const now = new Date().toISOString();
  return {
    date_key: dateKey,
    note: String(holiday?.note || "").trim() || null,
    created_at: holiday?.createdAt || holiday?.created_at || now,
    updated_at: holiday?.updatedAt || holiday?.updated_at || now,
  };
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
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
    const errorText = await response.text().catch(() => "");
    const error = new Error(`supabase_${response.status}`);
    error.status = 502;
    error.detail = errorText;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
}
