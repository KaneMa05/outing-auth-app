const crypto = require("crypto");

const COOKIE_NAME = "teacher_session";
const SESSION_SECONDS = 8 * 60 * 60;
const ADMIN_PERMISSIONS = ["*"];
const STUDENT_MANAGER_PERMISSIONS = [
  "outing.read",
  "outing.approve",
  "outing.memo",
  "penalties.read",
  "penalties.write",
  "managers.read",
  "attendance.read",
  "attendance.write",
];

function getConfig() {
  const username = process.env.TEACHER_USERNAME || "admin";
  const password = process.env.TEACHER_PASSWORD || "";
  const secret = process.env.TEACHER_SESSION_SECRET || password;
  const managerUsername = process.env.STUDENT_MANAGER_USERNAME || "manager";
  const managerPassword = process.env.STUDENT_MANAGER_PASSWORD || "qwer1234!";
  return { username, password, secret, managerUsername, managerPassword };
}

function getAccounts() {
  const { username, password, managerUsername, managerPassword } = getConfig();
  return [
    {
      username,
      password,
      role: "admin",
      permissions: ADMIN_PERMISSIONS,
    },
    {
      username: managerUsername,
      password: managerPassword,
      role: "student_manager",
      permissions: STUDENT_MANAGER_PERMISSIONS,
    },
  ].filter((account) => account.username && account.password);
}

function findAccount(username, password) {
  return getAccounts().find(
    (account) => timingSafeEqualText(username, account.username) && timingSafeEqualText(password, account.password)
  );
}

function getRequestIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((ip) => ip.trim())
    .find(Boolean);
  return forwardedFor || req.socket?.remoteAddress || "";
}

function normalizeIp(value) {
  return String(value || "").replace(/^::ffff:/, "").trim();
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

function createSessionToken(secret, account) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({
      iat: now,
      exp: now + SESSION_SECONDS,
      username: account.username,
      role: account.role,
      permissions: account.permissions,
    })
  );
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
  return Boolean(readSessionToken(token, secret));
}

function readSessionToken(token, secret) {
  if (!token || !secret) return false;
  const [payload, signature] = String(token).split(".");
  if (!payload || !signature) return false;
  if (!timingSafeEqualText(signature, sign(payload, secret))) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Number(data.exp) <= Math.floor(Date.now() / 1000)) return false;
    return {
      username: data.username || "",
      role: data.role || "admin",
      permissions: Array.isArray(data.permissions) ? data.permissions : ADMIN_PERMISSIONS,
    };
  } catch {
    return false;
  }
}

function hasPermission(session, permission) {
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  return permissions.includes("*") || permissions.includes(permission);
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
  findAccount,
  getConfig,
  getRequestIp,
  hasPermission,
  normalizeIp,
  readSessionToken,
  readCookie,
  sessionCookie,
  timingSafeEqualText,
  verifySessionToken,
};
