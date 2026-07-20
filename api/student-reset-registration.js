const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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
    await resetRemoteRegistration(res, { studentId, passwordHash, reason, client: body.client || {} });
    return;
  }

  await resetLocalRegistration(res, { studentId, passwordHash, reason, client: body.client || {} });
};

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function resetRemoteRegistration(res, { studentId, passwordHash, reason, client }) {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/reset_student_devices`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_student_id: studentId,
      p_password_hash: passwordHash,
      p_actor: "student",
      p_reason: reason,
      p_client_display_mode: client?.displayMode || null,
      p_client_user_agent: client?.userAgent || null,
    }),
  });
  if (!response.ok) {
    res.status(response.status === 404 ? 503 : 502).json({ ok: false, error: "student_device_store_unavailable" });
    return;
  }
  const result = await response.json().catch(() => null);
  if (result?.error === "student_not_found") {
    res.status(404).json({ ok: false, error: result.error });
    return;
  }
  if (result?.error === "password_mismatch") {
    res.status(403).json({ ok: false, error: result.error });
    return;
  }
  if (!result?.reset) {
    res.status(400).json({ ok: false, error: result?.error || "registration_reset_failed" });
    return;
  }
  res.status(200).json({ ok: true, revokedCount: Number(result.revoked_count || 0) });
}

async function resetLocalRegistration(res, { studentId, passwordHash, reason, client }) {
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

  const previousDeviceToken = student.deviceToken || "";
  student.passwordHash = "";
  student.deviceToken = "";
  student.appRegisteredAt = "";
  state.studentRegistrationEvents = [
    createLocalRegistrationEvent({
      studentId,
      studentName: student.name || "",
      eventType: "reset",
      deviceToken: previousDeviceToken,
      reason,
      actor: "student",
      client,
    }),
    ...(state.studentRegistrationEvents || []),
  ];
  if (state.settings?.studentProfiles) delete state.settings.studentProfiles[studentId];
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  res.status(200).json({ ok: true });
}

function createLocalRegistrationEvent({ studentId, studentName, eventType, deviceToken, reason, actor, client }) {
  return {
    id: crypto.randomUUID(),
    studentId,
    studentName: studentName || "",
    eventType,
    deviceToken: deviceToken || "",
    reason: reason || "",
    actor: actor || "",
    clientDisplayMode: client?.displayMode || "",
    clientUserAgent: client?.userAgent || "",
    createdAt: new Date().toISOString(),
  };
}
