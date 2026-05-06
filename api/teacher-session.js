const {
  COOKIE_NAME,
  getConfig,
  readCookie,
  verifySessionToken,
} = require("./teacher-auth-utils");

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ ok: false });
    return;
  }

  const { secret } = getConfig();
  const token = readCookie(req, COOKIE_NAME);
  res.status(200).json({ ok: verifySessionToken(token, secret) });
};
