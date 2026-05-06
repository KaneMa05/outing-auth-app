const crypto = require("crypto");

const COOKIE_NAME = "teacher_session";
const SESSION_SECONDS = 8 * 60 * 60;

function getConfig() {
  const username = process.env.TEACHER_USERNAME || "admin";
  const password = process.env.TEACHER_PASSWORD || "";
  const secret = process.env.TEACHER_SESSION_SECRET || password;
  return { username, password, secret };
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function createSessionToken(secret) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({ iat: now, exp: now + SESSION_SECONDS }));
  return `${payload}.${sign(payload, secret)}`;
}

function readCookie(req, name) {
  const cookie = req.headers.cookie || "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function verifySessionToken(token, secret) {
  if (!token || !secret) return false;
  const [payload, signature] = String(token).split(".");
  if (!payload || !signature) return false;
  if (!timingSafeEqualText(signature, sign(payload, secret))) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(data.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function sessionCookie(token, req) {
  const isHttps = req.headers["x-forwarded-proto"] === "https";
  const secure = isHttps ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secure}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

module.exports = {
  COOKIE_NAME,
  clearSessionCookie,
  createSessionToken,
  getConfig,
  readCookie,
  sessionCookie,
  timingSafeEqualText,
  verifySessionToken,
};
