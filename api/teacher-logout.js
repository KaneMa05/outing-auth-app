const { clearSessionCookie } = require("./teacher-auth-utils");

module.exports = function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false });
    return;
  }

  res.setHeader("Set-Cookie", clearSessionCookie());
  res.status(200).json({ ok: true });
};
