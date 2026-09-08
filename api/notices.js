const crypto = require("crypto");
const {
  COOKIE_NAME,
  getConfig,
  hasPermission,
  readCookie,
  readSessionToken,
} = require("./teacher-auth-utils");

const NOTICE_IMAGE_BUCKET = "notice-images";
const NOTICE_IMAGE_MAX_BYTES = 900 * 1024;
const NOTICE_REQUEST_MAX_BYTES = 2 * 1024 * 1024;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const session = readTeacherSession(req);
  if (!session) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  if (!hasPermission(session, "notices.write")) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }

  try {
    const body = await readJson(req);
    if (body.action === "save") {
      const notice = normalizeNotice(body.notice);
      const currentNotice = await loadNotice(notice.id);
      const previousImagePath = normalizeNoticeImagePath(currentNotice?.image_path, { optional: true });
      let nextImagePath = body.removeImage === true ? "" : previousImagePath;
      let uploadedImagePath = "";
      if (body.image) {
        const image = normalizeNoticeImage(body.image);
        uploadedImagePath = `${notice.id}/${crypto.randomUUID()}.jpg`;
        await uploadNoticeImage(uploadedImagePath, image);
        nextImagePath = uploadedImagePath;
      }

      try {
        const payload = { ...notice, image_path: nextImagePath || null };
        if (body.update === true) {
          if (!currentNotice) throw httpError("notice_not_found", 404);
          const { id, created_at, ...updates } = payload;
          await requestSupabase("PATCH", `notices?id=eq.${encodeURIComponent(id)}`, updates, { Prefer: "return=minimal" });
        } else {
          await requestSupabase("POST", "notices", payload, { Prefer: "return=minimal" });
        }
      } catch (error) {
        if (uploadedImagePath) await deleteNoticeImage(uploadedImagePath);
        throw error;
      }

      if (previousImagePath && previousImagePath !== nextImagePath) await deleteNoticeImage(previousImagePath);
      res.status(body.update === true ? 200 : 201).json({ ok: true, imagePath: nextImagePath });
      return;
    }

    if (body.action === "delete") {
      const noticeId = normalizeNoticeId(body.noticeId);
      const currentNotice = await loadNotice(noticeId);
      if (!currentNotice) throw httpError("notice_not_found", 404);
      await requestSupabase("DELETE", `notices?id=eq.${encodeURIComponent(noticeId)}`, undefined, { Prefer: "return=minimal" });
      const imagePath = normalizeNoticeImagePath(currentNotice.image_path, { optional: true });
      if (imagePath) await deleteNoticeImage(imagePath);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ ok: false, error: "unsupported_action" });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "notice_store_unavailable" });
  }
};

function readTeacherSession(req) {
  const { secret } = getConfig();
  return readSessionToken(readCookie(req, COOKIE_NAME), secret);
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") {
    if (Buffer.byteLength(JSON.stringify(req.body), "utf8") > NOTICE_REQUEST_MAX_BYTES) throw httpError("payload_too_large", 413);
    return req.body;
  }
  if (typeof req.body === "string") {
    if (Buffer.byteLength(req.body, "utf8") > NOTICE_REQUEST_MAX_BYTES) throw httpError("payload_too_large", 413);
    return JSON.parse(req.body || "{}");
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > NOTICE_REQUEST_MAX_BYTES) throw httpError("payload_too_large", 413);
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function normalizeNotice(value) {
  const title = normalizeRequiredText(value?.title, 500, "invalid_title");
  const body = normalizeRequiredText(value?.body, 50000, "invalid_body", true);
  const targetAudience = normalizeNoticeTargetAudience(value?.targetAudience);
  return {
    id: normalizeNoticeId(value?.id),
    title,
    body,
    target_audience: targetAudience,
    is_published: value?.isPublished !== false,
    created_at: normalizeTimestamp(value?.createdAt),
    updated_at: normalizeTimestamp(value?.updatedAt),
  };
}

function normalizeNoticeTargetAudience(value) {
  const normalized = String(value || "").trim();
  if (normalized === "academy") return "academy";
  const allowed = ["offline", "online_managed", "lecture"];
  const requested = normalized.split(",").map((item) => item.trim()).filter(Boolean);
  if (!requested.length || requested.some((item) => !allowed.includes(item))) return "academy";
  return allowed.filter((item) => requested.includes(item)).join(",");
}

function normalizeRequiredText(value, maxLength, errorCode, preserveLines = false) {
  const text = preserveLines
    ? String(value || "").replace(/\r\n?/g, "\n").trim()
    : String(value || "").trim();
  if (!text || text.length > maxLength) throw httpError(errorCode, 400);
  return text;
}

function normalizeTimestamp(value) {
  const parsed = new Date(value || "");
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normalizeNoticeId(value) {
  const noticeId = String(value || "").trim();
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(noticeId)) throw httpError("invalid_notice_id", 400);
  return noticeId;
}

function normalizeNoticeImage(value) {
  const contentType = String(value?.contentType || "").trim().toLowerCase();
  const match = String(value?.data || "").match(/^data:(image\/jpeg);base64,([a-z0-9+/=]+)$/i);
  if (!match || contentType !== "image/jpeg") throw httpError("invalid_image", 400);
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > NOTICE_IMAGE_MAX_BYTES) {
    throw httpError(buffer.length > NOTICE_IMAGE_MAX_BYTES ? "image_too_large" : "invalid_image", 400);
  }
  if (!(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)) throw httpError("invalid_image", 400);
  return { contentType, buffer };
}

function normalizeNoticeImagePath(value, options = {}) {
  const path = String(value || "").trim();
  if (!path && options.optional) return "";
  if (!/^[a-zA-Z0-9_-]{1,120}\/[a-f0-9-]{36}\.jpg$/i.test(path)) throw httpError("invalid_image_path", 400);
  return path;
}

async function loadNotice(noticeId) {
  const rows = await requestSupabase("GET", `notices?id=eq.${encodeURIComponent(noticeId)}&select=id,image_path&limit=1`);
  return rows?.[0] || null;
}

async function uploadNoticeImage(path, image) {
  await requestStorage("POST", `object/${NOTICE_IMAGE_BUCKET}/${path}`, image.buffer, {
    "Content-Type": image.contentType,
    "Cache-Control": "3600",
    "x-upsert": "false",
  });
}

async function deleteNoticeImage(path) {
  try {
    await requestStorage(
      "DELETE",
      `object/${NOTICE_IMAGE_BUCKET}`,
      JSON.stringify({ prefixes: [path] }),
      { "Content-Type": "application/json" }
    );
  } catch (error) {
    console.warn("Notice image cleanup failed.", path, error.message);
  }
}

async function requestSupabase(method, path, body, extraHeaders = {}) {
  return requestSupabaseService("rest/v1", method, path, body, { "Content-Type": "application/json", ...extraHeaders });
}

async function requestStorage(method, path, body, extraHeaders = {}) {
  return requestSupabaseService("storage/v1", method, path, body, extraHeaders);
}

async function requestSupabaseService(servicePath, method, path, body, extraHeaders = {}) {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) throw httpError("service_role_not_configured", 503);
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/${servicePath}/${path}`, {
    method,
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, ...extraHeaders },
    body: body === undefined ? undefined : Buffer.isBuffer(body) || typeof body === "string" ? body : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = httpError(servicePath.startsWith("storage") ? "notice_image_store_unavailable" : "notice_store_unavailable", response.status === 404 ? 503 : 502);
    error.storeStatus = response.status;
    error.details = await response.text().catch(() => "");
    throw error;
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports._private = {
  normalizeNotice,
  normalizeNoticeTargetAudience,
  normalizeNoticeId,
  normalizeNoticeImage,
  normalizeNoticeImagePath,
};
