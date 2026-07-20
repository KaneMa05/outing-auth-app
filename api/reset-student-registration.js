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

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/reset_student_devices`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_student_id: studentId,
      p_password_hash: null,
      p_actor: "teacher",
      p_reason: "관리자 등록 초기화",
      p_client_display_mode: null,
      p_client_user_agent: null,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    res.status(response.status === 404 ? 503 : 502).json({ ok: false, error: "student_device_store_unavailable", detail: errorText });
    return;
  }
  const result = await response.json().catch(() => null);
  if (result?.error === "student_not_found") {
    res.status(404).json({ ok: false, error: result.error });
    return;
  }
  if (!result?.reset) {
    res.status(400).json({ ok: false, error: result?.error || "registration_reset_failed" });
    return;
  }
  res.status(200).json({ ok: true, revokedCount: Number(result.revoked_count || 0) });
};
