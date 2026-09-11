const crypto = require("crypto");

function isRewardStudent(student) {
  return student?.is_active === true && student.account_type === "student"
    && student.class_name !== "스터디카페 운영계정"
    && !/^0*([1-9]|10)$/.test(String(student.id));
}

async function requestStore(method, path, body) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("rewards_unavailable");
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
    method,
    signal: AbortSignal.timeout(8000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error("rewards_unavailable");
  return response.status === 204 ? null : response.json();
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  let body;
  try {
    if (req.body !== undefined) body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    else {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 4096) throw new Error("body_too_large");
      }
      body = JSON.parse(raw || "{}");
    }
  } catch (_) {
    return res.status(400).json({ ok: false, error: "invalid_body" });
  }
  const { action, studentId, deviceToken } = body || {};
  if (!["sync", "acknowledge", "history"].includes(action)
    || typeof studentId !== "string" || !studentId.trim() || studentId.length > 64
    || typeof deviceToken !== "string" || !deviceToken || deviceToken.length > 256
    || (action === "acknowledge" && !["welcome", "routine3"].includes(body.rewardKey))) {
    return res.status(400).json({ ok: false, error: "invalid_request" });
  }
  try {
    const validation = await requestStore("POST", "rpc/validate_student_device", {
      p_student_id: studentId,
      p_device_token_hash: crypto.createHash("sha256").update(deviceToken).digest("hex"),
      p_client_display_mode: String(body.client?.displayMode || "").slice(0, 40) || null,
      p_client_user_agent: String(body.client?.userAgent || "").slice(0, 500) || null,
    });
    if (validation?.valid !== true) return res.status(403).json({ ok: false, error: "device_not_active" });
    const id = encodeURIComponent(studentId);
    const rows = await requestStore("GET", `students?id=eq.${id}&select=id,is_active,account_type,class_name&limit=1`);
    if (!isRewardStudent(rows?.[0])) return res.status(403).json({ ok: false, error: "student_only" });
    if (action === "acknowledge") {
      await requestStore("PATCH", `student_reward_receipts?student_id=eq.${id}&reward_key=eq.${body.rewardKey}&acknowledged_at=is.null`, {
        acknowledged_at: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true });
    }
    if (action === "history") {
      const history = await requestStore("GET", `study_cafe_point_ledger?student_id=eq.${id}&select=amount,description,created_at&order=created_at.desc&limit=30`);
      return res.status(200).json({ ok: true, history });
    }
    // Amount, duration, eligibility and completion are never accepted from clients.
    const result = await requestStore("POST", "rpc/sync_student_rewards", {
      p_student_id: studentId, p_welcome: body.welcome === true,
    });
    return res.status(200).json(result);
  } catch (_) {
    // A missing migration or a temporary reward failure must not stop login/study.
    return res.status(503).json({ ok: false, error: "rewards_unavailable" });
  }
};

module.exports._private = { isRewardStudent };
