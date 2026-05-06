const {
  createSessionToken,
  findAccount,
  getConfig,
  getRequestIp,
  normalizeIp,
  sessionCookie,
} = require("./teacher-auth-utils");

const IP_TABLE = "manager_allowed_ips";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false });
    return;
  }

  const { secret } = getConfig();
  if (!secret) {
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

  const account = findAccount(body.username, body.password);
  if (!account) {
    res.status(401).json({ ok: false });
    return;
  }

  if (account.role === "student_manager") {
    const ipResult = await ensureManagerIpAllowed(req, account.username);
    if (!ipResult.ok) {
      res.status(ipResult.status).json({ ok: false, error: ipResult.error });
      return;
    }
  }

  res.setHeader("Set-Cookie", sessionCookie(createSessionToken(secret, account), req));
  res.status(200).json({
    ok: true,
    user: {
      username: account.username,
      role: account.role,
      permissions: account.permissions,
    },
  });
};

async function ensureManagerIpAllowed(req, username) {
  const requestIp = normalizeIp(getRequestIp(req));
  if (!requestIp) return { ok: false, status: 403, error: "manager_ip_unknown" };

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return process.env.VERCEL
      ? { ok: false, status: 503, error: "manager_ip_store_not_configured" }
      : { ok: true, firstRegistered: false };
  }

  const baseUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${IP_TABLE}`;
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
  const query = `username=eq.${encodeURIComponent(username)}&select=username,ip_address`;
  const readResponse = await fetch(`${baseUrl}?${query}`, { headers });
  if (!readResponse.ok) return { ok: false, status: 503, error: "manager_ip_store_unavailable" };

  const rows = await readResponse.json().catch(() => []);
  const saved = Array.isArray(rows) ? rows[0] : null;
  if (!saved) {
    const insertResponse = await fetch(baseUrl, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        username,
        ip_address: requestIp,
        last_seen_at: new Date().toISOString(),
      }),
    });
    return insertResponse.ok
      ? { ok: true, firstRegistered: true }
      : { ok: false, status: 503, error: "manager_ip_register_failed" };
  }

  if (normalizeIp(saved.ip_address) !== requestIp) {
    return { ok: false, status: 403, error: "manager_ip_not_allowed" };
  }

  await fetch(`${baseUrl}?username=eq.${encodeURIComponent(username)}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
  }).catch(() => null);

  return { ok: true, firstRegistered: false };
}
