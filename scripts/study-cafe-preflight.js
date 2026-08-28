const fs = require("node:fs");
const path = require("node:path");

const CHECKS = [
  {
    name: "프로필·닉네임 컬럼",
    path: "study_cafe_profiles?select=student_id,avatar_tone,nickname&limit=1",
    required: true,
  },
  { name: "과목 테이블", path: "study_cafe_subjects?select=id&limit=1", required: true },
  {
    name: "타이머 세션 컬럼",
    path: "study_cafe_sessions?select=id,student_id,subject_name,status,elapsed_seconds,started_at,active_started_at,ended_at&limit=1",
    required: true,
  },
  {
    name: "좌석·표시이름 컬럼",
    path: "study_cafe_presence?select=student_id,seat_number,status,current_subject,display_name,last_heartbeat_at&limit=1",
    required: true,
  },
  {
    name: "Study cafe todos",
    path: "study_cafe_todos?select=id,student_id,study_date,subject_name,content,is_completed&limit=1",
    required: true,
  },
  {
    name: "Study cafe subject goals",
    path: "study_cafe_subject_goals?select=student_id,study_date,subject_name,target_minutes&limit=1",
    required: true,
  },
  {
    name: "Study cafe shop items",
    path: "study_cafe_shop_items?select=id,slot,price,is_active&limit=1",
    required: true,
  },
  {
    name: "Study cafe point wallets",
    path: "study_cafe_point_wallets?select=student_id,balance,awarded_study_points&limit=1",
    required: true,
  },
  {
    name: "Study cafe point ledger",
    path: "study_cafe_point_ledger?select=id,student_id,amount,balance_after&limit=1",
    required: true,
  },
  {
    name: "Study cafe inventory",
    path: "study_cafe_inventory?select=student_id,item_id&limit=1",
    required: true,
  },
  {
    name: "Study cafe equipment",
    path: "study_cafe_equipment?select=student_id,slot,item_id&limit=1",
    required: true,
  },
  {
    name: "활성 온라인 학생",
    path: "students?id=like.2*&is_active=eq.true&select=id&limit=1",
    required: false,
    count: true,
  },
];

async function main() {
  const config = loadConfig(process.cwd());
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Supabase 서버 환경 변수를 찾지 못했습니다.");
    process.exitCode = 1;
    return;
  }

  const results = [];
  for (const check of CHECKS) {
    results.push(await runCheck(config, check));
  }

  console.table(results.map((result) => ({
    항목: result.name,
    상태: result.status,
    개수: result.count === null ? "-" : result.count,
  })));

  const missingSchema = results.some((result) => result.required && result.status !== "준비됨");
  const onlineStudentCount = results.find((result) => result.name === "활성 온라인 학생")?.count || 0;
  if (missingSchema) {
    console.error("스터디카페 마이그레이션이 아직 적용되지 않았습니다.");
    process.exitCode = 2;
    return;
  }
  if (!onlineStudentCount) {
    console.error("검증에 사용할 활성 온라인 학생 계정이 없습니다.");
    process.exitCode = 3;
    return;
  }
  console.log("스터디카페 통합 테스트를 진행할 준비가 되었습니다.");
}

async function runCheck(config, check) {
  try {
    const response = await fetch(
      `${config.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${check.path}`,
      {
        method: "GET",
        headers: {
          apikey: config.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "count=exact",
        },
      }
    );
    const count = check.count ? parseContentRange(response.headers.get("content-range")) : null;
    return {
      name: check.name,
      required: check.required,
      status: response.ok ? "준비됨" : response.status === 404 ? "미적용" : `오류 ${response.status}`,
      count,
    };
  } catch {
    return { name: check.name, required: check.required, status: "연결 실패", count: null };
  }
}

function loadConfig(root) {
  const values = { ...process.env };
  for (const filename of [".env", ".env.local", ".env.production.local"]) {
    const filepath = path.join(root, filename);
    if (!fs.existsSync(filepath)) continue;
    const parsed = parseEnvFile(fs.readFileSync(filepath, "utf8"));
    Object.entries(parsed).forEach(([key, value]) => {
      if (!values[key]) values[key] = value;
    });
  }
  return values;
}

function parseEnvFile(source) {
  const values = {};
  String(source || "").split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) return;
    const value = match[2];
    values[match[1]] =
      (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value;
  });
  return values;
}

function parseContentRange(value) {
  const match = String(value || "").match(/\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.message || "사전점검에 실패했습니다.");
    process.exitCode = 1;
  });
}

module.exports._private = {
  loadConfig,
  parseContentRange,
  parseEnvFile,
  runCheck,
};
