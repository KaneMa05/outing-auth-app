const {
  COOKIE_NAME,
  getConfig,
  hasPermission,
  readSessionToken,
  readCookie,
} = require("./teacher-auth-utils");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false });
    return;
  }

  const { secret } = getConfig();
  const token = readCookie(req, COOKIE_NAME);
  const session = readSessionToken(token, secret);
  if (!session) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  if (!hasPermission(session, "students.reset")) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(503).json({ ok: false, error: "supabase_not_configured" });
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  let body = {};
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    res.status(400).json({ ok: false, error: "invalid_json" });
    return;
  }

  const studentId = String(body.studentId || "").trim();
  if (!studentId) {
    res.status(400).json({ ok: false, error: "missing_student_id" });
    return;
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/students?id=eq.${encodeURIComponent(studentId)}`;
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      password_hash: null,
      device_token: null,
      app_registered_at: null,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    res.status(502).json({ ok: false, error: "supabase_update_failed", detail: errorText });
    return;
  }

  res.status(200).json({ ok: true });
};
