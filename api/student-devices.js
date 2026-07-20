const crypto = require("crypto");
const {
  COOKIE_NAME,
  getConfig,
  hasPermission,
  readCookie,
  readSessionToken,
} = require("./teacher-auth-utils");

const MAX_TEXT_LENGTH = 500;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = await readJson(req);
    const action = String(body.action || "register").trim();
    if (!["register", "validate", "list", "revoke", "admin_list", "admin_revoke"].includes(action)) {
      res.status(400).json({ ok: false, error: "unsupported_action" });
      return;
    }

    const studentId = normalizeText(body.studentId, 64);
    if (!studentId) {
      res.status(400).json({ ok: false, error: "missing_required_fields" });
      return;
    }

    if (action.startsWith("admin_")) {
      const session = readTeacherSession(req);
      if (!session) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return;
      }
      if (!hasPermission(session, action === "admin_list" ? "students.read" : "students.reset")) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }
      if (action === "admin_list") {
        const devices = await loadActiveDevices(studentId);
        res.status(200).json({ ok: true, devices });
        return;
      }
      const targetDeviceId = normalizeUuid(body.targetDeviceId);
      if (!targetDeviceId) {
        res.status(400).json({ ok: false, error: "missing_target_device" });
        return;
      }
      const result = await revokeRemoteDevice({
        studentId,
        requesterTokenHash: "",
        targetDeviceId,
        actor: "teacher",
        reason: normalizeText(body.reason, 200) || "관리자 기기 해제",
      });
      if (result.error) {
        res.status(result.error === "device_not_found" ? 404 : 400).json({ ok: false, error: result.error });
        return;
      }
      res.status(200).json({ ok: true, activeCount: Number(result.active_count || 0) });
      return;
    }

    const deviceToken = normalizeText(body.deviceToken, 256);
    if (!deviceToken) {
      res.status(400).json({ ok: false, error: "missing_required_fields" });
      return;
    }

    const client = body.client && typeof body.client === "object" ? body.client : {};
    if (["validate", "list", "revoke"].includes(action)) {
      const validation = await validateRemoteDevice({
        studentId,
        deviceToken,
        displayMode: normalizeText(client.displayMode, 40),
        userAgent: normalizeText(client.userAgent, MAX_TEXT_LENGTH),
      });
      if (validation.error) {
        res.status(403).json({ ok: false, error: "device_not_active" });
        return;
      }
      if (action === "validate") {
        res.status(200).json({
          ok: true,
          valid: validation.valid === true,
          deviceId: validation.device_id || "",
          activeCount: Number(validation.active_count || 0),
        });
        return;
      }
      if (action === "list") {
        const devices = await loadActiveDevices(studentId, hashDeviceToken(deviceToken));
        res.status(200).json({ ok: true, devices });
        return;
      }

      const targetDeviceId = normalizeUuid(body.targetDeviceId);
      if (!targetDeviceId) {
        res.status(400).json({ ok: false, error: "missing_target_device" });
        return;
      }
      const result = await revokeRemoteDevice({
        studentId,
        requesterTokenHash: hashDeviceToken(deviceToken),
        targetDeviceId,
        actor: "student",
        reason: normalizeText(body.reason, 200) || "학생 기기 해제",
      });
      if (result.error) {
        res.status(result.error === "device_not_active" ? 403 : 404).json({ ok: false, error: result.error });
        return;
      }
      res.status(200).json({
        ok: true,
        selfRevoked: result.self_revoked === true,
        activeCount: Number(result.active_count || 0),
      });
      return;
    }

    const passwordHash = normalizeText(body.passwordHash, 256);
    if (!passwordHash) {
      res.status(400).json({ ok: false, error: "missing_required_fields" });
      return;
    }

    const result = await registerRemoteDevice({
      studentId,
      passwordHash,
      deviceToken,
      deviceLabel: normalizeText(body.deviceLabel, 80) || "Registered device",
      track: normalizeText(body.track, 80),
      gender: normalizeStudentGender(body.gender),
      displayMode: normalizeText(client.displayMode, 40),
      userAgent: normalizeText(client.userAgent, MAX_TEXT_LENGTH),
    });

    if (result.error === "device_limit_reached") {
      res.status(409).json({ ok: false, error: result.error, activeCount: result.active_count || 2 });
      return;
    }
    if (["student_not_found", "student_inactive", "password_mismatch"].includes(result.error)) {
      res.status(403).json({ ok: false, error: "invalid_credentials" });
      return;
    }
    if (result.error) {
      res.status(400).json({ ok: false, error: result.error });
      return;
    }

    res.status(200).json({
      ok: true,
      status: result.status || "registered",
      deviceId: result.device_id || "",
      activeCount: Number(result.active_count || 0),
    });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "student_device_error" });
  }
};

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function normalizeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeStudentGender(value) {
  const gender = normalizeText(value, 10);
  return ["남", "여"].includes(gender) ? gender : "";
}

function hashDeviceToken(deviceToken) {
  return crypto.createHash("sha256").update(deviceToken).digest("hex");
}

function normalizeUuid(value) {
  const id = normalizeText(value, 64);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : "";
}

function readTeacherSession(req) {
  const { secret } = getConfig();
  const request = req?.headers ? req : { ...req, headers: {} };
  return readSessionToken(readCookie(request, COOKIE_NAME), secret);
}

async function loadActiveDevices(studentId, currentTokenHash = "") {
  const rows = await requestSupabase(
    "GET",
    `student_devices?student_id=eq.${encodeURIComponent(studentId)}&revoked_at=is.null&select=id,device_token_hash,token_preview,device_label,client_display_mode,registered_at,last_used_at&order=registered_at.asc`
  );
  return (Array.isArray(rows) ? rows : []).map((device) => ({
    id: device.id,
    label: device.device_label || "등록 기기",
    tokenPreview: device.token_preview || "",
    displayMode: device.client_display_mode || "",
    registeredAt: device.registered_at || "",
    lastUsedAt: device.last_used_at || "",
    isCurrent: Boolean(currentTokenHash && device.device_token_hash === currentTokenHash),
  }));
}

async function revokeRemoteDevice({ studentId, requesterTokenHash, targetDeviceId, actor, reason }) {
  return requestSupabase("POST", "rpc/revoke_student_device", {
    p_student_id: studentId,
    p_requester_token_hash: requesterTokenHash || "",
    p_target_device_id: targetDeviceId,
    p_actor: actor,
    p_reason: reason || null,
  });
}

async function requestSupabase(method, path, body) {
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
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const error = new Error("student_device_store_unavailable");
    error.status = response.status === 404 ? 503 : 502;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

async function registerRemoteDevice({
  studentId,
  passwordHash,
  deviceToken,
  deviceLabel,
  track,
  gender,
  displayMode,
  userAgent,
}) {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error("service_role_not_configured");
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/register_student_device`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_student_id: studentId,
      p_password_hash: passwordHash,
      p_device_token_hash: hashDeviceToken(deviceToken),
      p_token_preview: deviceToken.slice(-8),
      p_device_label: deviceLabel,
      p_track: track || null,
      p_gender: gender || null,
      p_client_display_mode: displayMode || null,
      p_client_user_agent: userAgent || null,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error("student_device_store_unavailable");
    error.status = response.status === 404 ? 503 : 502;
    error.detail = detail;
    throw error;
  }

  const result = await response.json().catch(() => null);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    const error = new Error("invalid_student_device_response");
    error.status = 502;
    throw error;
  }
  return result;
}

async function validateRemoteDevice({ studentId, deviceToken, displayMode, userAgent }) {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error("service_role_not_configured");
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/validate_student_device`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_student_id: studentId,
      p_device_token_hash: hashDeviceToken(deviceToken),
      p_client_display_mode: displayMode || null,
      p_client_user_agent: userAgent || null,
    }),
  });

  if (!response.ok) {
    const error = new Error("student_device_store_unavailable");
    error.status = response.status === 404 ? 503 : 502;
    throw error;
  }

  const result = await response.json().catch(() => null);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    const error = new Error("invalid_student_device_response");
    error.status = 502;
    throw error;
  }
  return result;
}

module.exports._private = {
  hashDeviceToken,
  normalizeStudentGender,
  normalizeText,
  normalizeUuid,
  loadActiveDevices,
  registerRemoteDevice,
  revokeRemoteDevice,
  validateRemoteDevice,
};
