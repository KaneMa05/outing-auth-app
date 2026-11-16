const { waitUntil } = require("@vercel/functions");

const WEBHOOK_KEYS = {
  written: "SLACK_WRITTEN_APPLICATION_WEBHOOK_URL",
  interview: "SLACK_INTERVIEW_APPLICATION_WEBHOOK_URL",
};
const COURSE_NAMES = { offline: "오프라인", online_managed: "온라인 관리반", lecture: "인터넷 수강생" };

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 160) || "미입력";
}

function submissionTime(application) {
  const date = new Date(application.updated_at || application.created_at || Date.now());
  if (Number.isNaN(date.getTime())) return "확인 필요";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "medium", hour12: false,
  }).format(date) + " (한국시간)";
}

function payloadFor(kind, application) {
  const interview = kind === "interview";
  const lines = [
    interview ? "🎤 면접반 수강 신청" : "📝 필기반 수강 신청",
    `이름: ${clean(application.name)}`,
    `직렬: ${clean(application.track)}`,
  ];
  if (interview) {
    lines.push(`수험번호: ${clean(application.exam_number)}`);
    if (application.revision > 1) lines.push("제출 유형: 신청 정보 수정·재신청");
  } else {
    lines.push(`과정: ${COURSE_NAMES[application.course_type] || "확인 필요"}`);
    const phone = String(application.phone || "").replace(/\D/g, "");
    if (/^01\d{8,9}$/.test(phone)) lines.push(`연락처: ${phone.slice(0, 3)}-****-${phone.slice(-4)}`);
    if (application.cohort) lines.push(`기수: ${clean(application.cohort)}기`);
  }
  lines.push(`신청 시각: ${submissionTime(application)}`);
  const text = lines.join("\n");
  return {
    text: text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
    blocks: [{ type: "section", text: { type: "plain_text", text, emoji: true } }],
    unfurl_links: false,
    unfurl_media: false,
  };
}

// Only called after a successful save. Background delivery never delays or
// changes the application's response. Missing configuration disables a channel.
function notifyApplicationSubmitted(kind, application, {
  env = process.env, fetcher = global.fetch, schedule = waitUntil,
  warn = (...args) => console.warn(...args),
} = {}) {
  const key = Object.hasOwn(WEBHOOK_KEYS, kind) ? WEBHOOK_KEYS[kind] : "";
  const webhook = key && String(env[key] || "").trim();
  if (!webhook || !application?.id) return;

  const task = (async () => {
    const url = new URL(webhook);
    if (url.protocol !== "https:" || url.hostname !== "hooks.slack.com" || url.port
      || url.username || url.password || url.search || url.hash
      || !/^\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
      throw new Error("invalid_webhook");
    }
    const response = await fetcher(url.href, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadFor(kind, application)),
      signal: AbortSignal.timeout(4000),
      redirect: "error",
    });
    if (!response.ok || (await response.text()).trim() !== "ok") throw new Error("delivery_failed");
  })().catch(() => {
    // Never log the webhook URL, response body, or applicant information.
    warn(`[application-slack] ${kind} delivery_failed`);
  });
  try { schedule(task); } catch { /* Delivery still runs in local runtimes. */ }
  return task;
}

module.exports = { notifyApplicationSubmitted };
