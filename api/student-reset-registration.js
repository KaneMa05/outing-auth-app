const fs = require("fs");
const path = require("path");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false });
    return;
  }

  const body = await readJson(req).catch(() => null);
  if (!body) {
    res.status(400).json({ ok: false, error: "invalid_json" });
    return;
  }

  const studentId = String(body.studentId || "").trim();
  const passwordHash = String(body.passwordHash || "").trim();
  const reason = String(body.reason || "").trim();
  if (!studentId || !passwordHash || !reason) {
    res.status(400).json({ ok: false, error: "missing_required_fields" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (supabaseUrl && serviceRoleKey) {
    await resetRemoteRegistration(res, { studentId, passwordHash });
    return;
  }

  await resetLocalRegistration(res, { studentId, passwordHash });
};

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function resetRemoteRegistration(res, { studentId, passwordHash }) {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const baseUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/students`;
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  const readResponse = await fetch(
    `${baseUrl}?id=eq.${encodeURIComponent(studentId)}&select=id,password_hash,app_registered_at,device_token`,
    { headers }
  );
  if (!readResponse.ok) {
    res.status(502).json({ ok: false, error: "supabase_read_failed" });
    return;
  }

  const rows = await readResponse.json().catch(() => []);
  const student = Array.isArray(rows) ? rows[0] : null;
  if (!student) {
    res.status(404).json({ ok: false, error: "student_not_found" });
    return;
  }
  if (student.password_hash !== passwordHash) {
    res.status(403).json({ ok: false, error: "password_mismatch" });
    return;
  }

  const updateResponse = await fetch(`${baseUrl}?id=eq.${encodeURIComponent(studentId)}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({
      password_hash: null,
      device_token: null,
      app_registered_at: null,
    }),
  });
  if (!updateResponse.ok) {
    res.status(502).json({ ok: false, error: "supabase_update_failed" });
    return;
  }

  res.status(200).json({ ok: true });
}

async function resetLocalRegistration(res, { studentId, passwordHash }) {
  const statePath = path.join(process.cwd(), ".local-dev-state.json");
  if (!fs.existsSync(statePath)) {
    res.status(503).json({ ok: false, error: "local_state_not_found" });
    return;
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    res.status(503).json({ ok: false, error: "local_state_invalid" });
    return;
  }

  const student = (state.students || []).find((item) => String(item.id) === studentId);
  if (!student) {
    res.status(404).json({ ok: false, error: "student_not_found" });
    return;
  }
  if (student.passwordHash !== passwordHash) {
    res.status(403).json({ ok: false, error: "password_mismatch" });
    return;
  }

  student.passwordHash = "";
  student.deviceToken = "";
  student.appRegisteredAt = "";
  if (state.settings?.studentProfiles) delete state.settings.studentProfiles[studentId];
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  res.status(200).json({ ok: true });
}
