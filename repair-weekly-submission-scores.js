const fs = require("fs");

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : "true"];
  })
);

const apply = args.get("apply") === "true";
const studentFilter = args.get("student") || "";
const cohortFilter = args.get("cohort") || "";
const weekFilter = args.get("week") || "";
const verbose = args.get("verbose") === "true";

async function loadConfig() {
  let supabaseUrl = process.env.SUPABASE_URL || "";
  let supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
  const files = [".env.local", ".env.production.local", ".env", "config.js"];
  for (const file of files) {
    if ((!supabaseUrl || !supabaseAnonKey) && fs.existsSync(file)) {
      const source = fs.readFileSync(file, "utf8");
      if (!supabaseUrl) supabaseUrl = source.match(/SUPABASE_URL\s*=\s*['"]?([^'"\r\n]+)/)?.[1] || source.match(/supabaseUrl:\s*['"]([^'"]+)/)?.[1] || "";
      if (!supabaseAnonKey) supabaseAnonKey = source.match(/SUPABASE_ANON_KEY\s*=\s*['"]?([^'"\r\n]+)/)?.[1] || source.match(/supabaseAnonKey:\s*['"]([^'"]+)/)?.[1] || "";
    }
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    const configUrl = args.get("config-url") || "https://outing-auth-app.vercel.app/config.js";
    const source = await fetch(configUrl).then((response) => response.text());
    supabaseUrl = source.match(/supabaseUrl:\s*"([^"]+)"/)?.[1] || "";
    supabaseAnonKey = source.match(/supabaseAnonKey:\s*"([^"]+)"/)?.[1] || "";
  }
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Missing Supabase config");
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ""), supabaseAnonKey };
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function inList(items) {
  return `in.(${items.join(",")})`;
}

function normalizeAnswer(value) {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).trim().normalize("NFKC").match(/[1-4]/);
  return match ? Number(match[0]) : null;
}

function normalizeCorrectAnswers(value, fallback) {
  const source = Array.isArray(value) && value.length ? value : [fallback];
  return [...new Set(source.flatMap((item) =>
    String(item ?? "").trim().normalize("NFKC").match(/[1-4]/g) || []
  ).map(Number))].sort((a, b) => a - b);
}

function normalizeTrack(track) {
  return String(track || "").trim();
}

const fixedWeeklyTracks = [
  "경찰직 - 공채(순경)",
  "경찰직 - 함정요원 항해(순경)",
  "경찰직 - 함정요원 기관(순경)",
  "경찰직 - 경위 공채(해양-기관)",
  "경찰직 - 경위 공채(해양-항해)",
];
const optionalTrackGroups = [
  { key: "vts", keywords: ["VTS"], tracks: ["경찰직 - 해상교통관제(VTS)(순경)", "일반직 - 선박교통관제(VTS)"] },
  { key: "academy", keywords: ["해경학과"], tracks: ["경찰직 - 해경학과 항해(경장)", "경찰직 - 해경학과 기관(경장)"] },
];

function normalizeTargetTracks(tracks) {
  const source = Array.isArray(tracks) && tracks.length ? tracks : fixedWeeklyTracks;
  return [...new Set([...fixedWeeklyTracks, ...source].map(normalizeTrack).filter(Boolean))];
}

function isQuestionForTrack(answer, track) {
  if (String(answer.subject || "") !== "해사법규") return true;
  const targetTracks = normalizeTargetTracks(answer.target_tracks);
  const normalizedTrack = normalizeTrack(track);
  if (targetTracks.includes(normalizedTrack)) return true;
  return optionalTrackGroups.some((group) =>
    group.tracks.some((groupTrack) => targetTracks.includes(normalizeTrack(groupTrack))) &&
    group.keywords.some((keyword) => normalizedTrack.includes(keyword))
  );
}

function pointValue(answer, section) {
  const saved = Number(answer.points);
  if (Number.isFinite(saved)) return saved;
  const questionCount = Number(section.question_count) || 0;
  const totalScore = Number(section.total_score) || 0;
  return questionCount && totalScore ? Math.round((totalScore / questionCount) * 1000) / 1000 : 5;
}

function groupBy(items, keyFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

(async () => {
  const { supabaseUrl, supabaseAnonKey } = await loadConfig();
  const headers = { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}`, "Content-Type": "application/json" };
  async function request(path, options = {}) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers, ...options });
    const text = await response.text();
    if (!response.ok) throw new Error(`${path} ${response.status} ${text}`);
    return text ? JSON.parse(text) : [];
  }
  async function getPaged(path) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const data = await request(path, { headers: { ...headers, Range: `${from}-${from + 999}` } });
      rows.push(...data);
      if (data.length < 1000) return rows;
    }
  }

  const examFilters = ["select=id,cohort,week_number,name"];
  if (cohortFilter) examFilters.push(`cohort=eq.${encodeURIComponent(cohortFilter)}`);
  if (weekFilter) examFilters.push(`week_number=eq.${encodeURIComponent(weekFilter)}`);
  const exams = await request(`exams?${examFilters.join("&")}`);
  const examIds = exams.map((exam) => exam.id).filter(Boolean);
  const sections = [];
  for (const chunk of chunks(examIds, 80)) {
    sections.push(...await request(`exam_sections?select=id,exam_id,track,subject,question_count,total_score,is_active&exam_id=${encodeURIComponent(inList(chunk))}`));
  }
  const sectionIds = sections.map((section) => section.id).filter(Boolean);
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const examById = new Map(exams.map((exam) => [exam.id, exam]));

  const answers = [];
  for (const chunk of chunks(sectionIds, 80)) {
    const filter = `exam_section_id=${encodeURIComponent(inList(chunk))}&order=question_number.asc`;
    try {
      answers.push(...await getPaged(`exam_answers?select=exam_section_id,question_number,correct_answer,correct_answers,points,target_tracks&${filter}`));
    } catch (error) {
      if (!String(error?.message || error).includes("correct_answers")) throw error;
      answers.push(...await getPaged(`exam_answers?select=exam_section_id,question_number,correct_answer,points,target_tracks&${filter}`));
    }
  }
  answers.forEach((answer) => {
    const section = sectionById.get(answer.exam_section_id);
    answer.subject = section?.subject || "";
  });

  const submissions = [];
  for (const chunk of chunks(sectionIds, 80)) {
    const filters = [`select=id,exam_section_id,student_id,student_name,track,status,score,correct_count`];
    filters.push(`exam_section_id=${encodeURIComponent(inList(chunk))}`);
    if (studentFilter) filters.push(`student_id=eq.${encodeURIComponent(studentFilter)}`);
    filters.push("order=id.asc");
    submissions.push(...await getPaged(`exam_submissions?${filters.join("&")}`));
  }
  const submissionIds = submissions.map((submission) => submission.id).filter(Boolean);
  const submissionAnswers = [];
  for (const chunk of chunks(submissionIds, 80)) {
    submissionAnswers.push(...await getPaged(`submission_answers?select=submission_id,question_number,selected_answer,is_correct,points_awarded&submission_id=${encodeURIComponent(inList(chunk))}&order=submission_id.asc,question_number.asc`));
  }

  const answersBySection = groupBy(answers, (answer) => answer.exam_section_id);
  const savedBySubmission = groupBy(submissionAnswers, (answer) => answer.submission_id);
  const repairs = [];
  let submissionsWithCompleteAnswers = 0;
  let submissionsWithIncompleteAnswers = 0;

  submissions.forEach((submission) => {
    const section = sectionById.get(submission.exam_section_id);
    if (!section) return;
    const answerKeys = (answersBySection.get(section.id) || [])
      .filter((answer) => !Number(section.question_count) || Number(answer.question_number) <= Number(section.question_count))
      .filter((answer) => isQuestionForTrack(answer, submission.track))
      .sort((a, b) => Number(a.question_number) - Number(b.question_number));
    if (!answerKeys.length) return;
    const savedAnswers = savedBySubmission.get(submission.id) || [];
    const savedByQuestion = new Map(savedAnswers.map((answer) => [Number(answer.question_number), answer]));
    const hasCompleteAnswers = answerKeys.every((answerKey) => normalizeAnswer(savedByQuestion.get(Number(answerKey.question_number))?.selected_answer));
    if (!hasCompleteAnswers) {
      submissionsWithIncompleteAnswers += 1;
      return;
    }
    submissionsWithCompleteAnswers += 1;
    let score = 0;
    let correctCount = 0;
    answerKeys.forEach((answerKey) => {
      const selected = normalizeAnswer(savedByQuestion.get(Number(answerKey.question_number))?.selected_answer);
      const correctAnswers = normalizeCorrectAnswers(answerKey.correct_answers, answerKey.correct_answer);
      if (selected && correctAnswers.includes(selected)) {
        correctCount += 1;
        score += pointValue(answerKey, section);
      }
    });
    score = Math.round(score * 10) / 10;
    if (Number(submission.score || 0) !== score || Number(submission.correct_count || 0) !== correctCount) {
      const exam = examById.get(section.exam_id) || {};
      repairs.push({
        id: submission.id,
        studentId: submission.student_id,
        studentName: submission.student_name,
        status: submission.status,
        cohort: exam.cohort,
        week: exam.week_number,
        subject: section.subject,
        fromScore: Number(submission.score || 0),
        toScore: score,
        fromCorrectCount: Number(submission.correct_count || 0),
        toCorrectCount: correctCount,
      });
    }
  });

  if (apply) {
    const failedRepairs = [];
    for (const repair of repairs) {
      const updatedRows = await request(`exam_submissions?id=eq.${repair.id}&select=id,score,correct_count`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({
          student_id: repair.studentId,
          status: repair.status,
          score: repair.toScore,
          correct_count: repair.toCorrectCount,
        }),
      });
      const updated = updatedRows[0];
      if (
        !updated ||
        Number(updated.score || 0) !== repair.toScore ||
        Number(updated.correct_count || 0) !== repair.toCorrectCount
      ) {
        failedRepairs.push({ ...repair, updated: updated || null });
      }
    }
    if (failedRepairs.length) {
      throw new Error(`Failed to update ${failedRepairs.length} submissions: ${JSON.stringify(failedRepairs.slice(0, 10))}`);
    }
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    scannedSubmissions: submissions.length,
    scannedSubmissionAnswers: submissionAnswers.length,
    submissionsWithCompleteAnswers,
    submissionsWithIncompleteAnswers,
    repairCount: repairs.length,
    repairs: verbose ? repairs : repairs.slice(0, 20),
    truncatedRepairs: verbose ? 0 : Math.max(0, repairs.length - 20),
  }, null, 2));
})().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
});
