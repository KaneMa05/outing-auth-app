const crypto = require("node:crypto");
const { TITLE, CATEGORY, BODY } = require("../lib/account-deletion-request");

function httpError(message, status) { return Object.assign(new Error(message), { status }); }

function createHandler({ request = requestSupabase } = {}) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }
    try {
      if (req.headers?.origin && new URL(req.headers.origin).host !== req.headers.host) throw httpError("forbidden", 403);
      const body = await readJson(req);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw httpError("invalid_request", 400);
      if (!["status", "request"].includes(body.action)) throw httpError("unsupported_action", 400);
      if (body.action === "request" && body.confirmation !== "계정 삭제") throw httpError("confirmation_required", 400);
      const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
      const token = typeof body.deviceToken === "string" ? body.deviceToken : "";
      if (!studentId || studentId.length > 64 || !token || token.length > 256) throw httpError("unauthorized", 401);
      const [validation, students] = await Promise.all([
        request("POST", "rpc/validate_student_device", {
          p_student_id: studentId,
          p_device_token_hash: crypto.createHash("sha256").update(token).digest("hex"),
          p_client_display_mode: null,
          p_client_user_agent: null,
        }),
        request("GET", `students?id=eq.${encodeURIComponent(studentId)}&is_active=eq.true&select=id&limit=1`),
      ]);
      if (validation?.valid !== true || !students?.some(row => row.id === studentId)) throw httpError("unauthorized", 401);
      const filters = `student_id=eq.${encodeURIComponent(studentId)}&category=eq.${encodeURIComponent(CATEGORY)}&title=eq.${encodeURIComponent(TITLE)}&deleted_at=is.null`;
      let rows = await request("GET", `student_inquiries?${filters}&select=id,created_at&order=created_at.desc&limit=1`);
      let created = false;
      if (!rows?.length && body.action === "request") {
        rows = await request("POST", "student_inquiries", {
          student_id: studentId, category: CATEGORY, title: TITLE, body: BODY,
        }, { Prefer: "return=representation" });
        // Never tell the user a request succeeded without a persisted receipt.
        if (!rows?.[0]?.id) throw httpError("deletion_request_unavailable", 503);
        created = true;
      }
      const row = rows?.[0];
      let replies = [];
      if (row) {
        replies = await request("GET", `student_inquiry_messages?inquiry_id=eq.${encodeURIComponent(row.id)}&author_type=eq.teacher&deleted_at=is.null&select=body,created_at&order=created_at.desc&limit=5`);
      }
      return res.status(created ? 201 : 200).json({
        ok: true,
        request: row ? { id: row.id, createdAt: row.created_at, status: "received", replies: (replies || []).map(reply => ({ body: reply.body, createdAt: reply.created_at })) } : null,
      });
    } catch (error) {
      // Do not log credentials or expose upstream response bodies.
      return res.status(error.status || 503).json({ ok: false, error: error.status ? error.message : "deletion_request_unavailable" });
    }
  };
}

async function requestSupabase(method, path, body, extraHeaders = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw httpError("deletion_request_unavailable", 503);
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
    method, signal: AbortSignal.timeout(10000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw httpError("deletion_request_unavailable", 503);
  return response.status === 204 ? null : response.json();
}

async function readJson(req) {
  const limit = 4096;
  if (req.body && typeof req.body === "object") {
    if (Buffer.byteLength(JSON.stringify(req.body)) > limit) throw httpError("payload_too_large", 413);
    return req.body;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw httpError("payload_too_large", 413);
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw httpError("invalid_request", 400); }
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
