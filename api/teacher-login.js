const {
  createSessionToken,
  getConfig,
  sessionCookie,
  timingSafeEqualText,
} = require("./teacher-auth-utils");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false });
    return;
  }

  const { username, password, secret } = getConfig();
  if (!password || !secret) {
    res.status(503).json({ ok: false, error: "not_configured" });
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  let body = {};
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    res.status(400).json({ ok: false });
    return;
  }

  if (!timingSafeEqualText(body.username, username) || !timingSafeEqualText(body.password, password)) {
    res.status(401).json({ ok: false });
    return;
  }

  res.setHeader("Set-Cookie", sessionCookie(createSessionToken(secret), req));
  res.status(200).json({ ok: true });
};
