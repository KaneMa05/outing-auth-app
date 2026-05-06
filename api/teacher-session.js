const {
  COOKIE_NAME,
  getConfig,
  readSessionToken,
  readCookie,
} = require("./teacher-auth-utils");

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ ok: false });
    return;
  }

  const { secret } = getConfig();
  const token = readCookie(req, COOKIE_NAME);
  const session = readSessionToken(token, secret);
  res.status(200).json({ ok: Boolean(session), user: session || null });
};
