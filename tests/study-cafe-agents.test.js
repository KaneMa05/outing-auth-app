const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const installSql = fs.readFileSync(
  path.join(root, "supabase", "add-study-cafe-agents.sql"),
  "utf8"
);
const pauseSql = fs.readFileSync(
  path.join(root, "supabase", "pause-study-cafe-agents.sql"),
  "utf8"
);
const verifySql = fs.readFileSync(
  path.join(root, "supabase", "verify-study-cafe-agents.sql"),
  "utf8"
);

const agentRows = installSql.match(/\('2999970[1-5]', '[^']+', null, '경찰직 - [^']+'/g) || [];
assert.equal(agentRows.length, 5, "exactly five agent configurations are required");
assert.equal(
  (installSql.match(/'경찰직 - 공채\(순경\)'/g) || []).length >= 6,
  true,
  "three public-recruitment students and three agent configs are required"
);
assert.match(installSql, /'29999704'[\s\S]*?'경찰직 - 함정요원 항해\(순경\)'/);
assert.match(installSql, /'29999705'[\s\S]*?'경찰직 - 함정요원 기관\(순경\)'/);
assert.match(installSql, /array\['해사법규', '해양경찰학개론', '해사영어', '항해학'\]/);
assert.match(installSql, /array\['해사법규', '해양경찰학개론', '해사영어', '기관학'\]/);
assert.equal(
  (installSql.match(/'2999970[1-5]', '[^']+', null, '경찰직 - /g) || []).length,
  5,
  "all agents should leave the saved profile nickname empty"
);
assert.match(installSql, /select\s+student_id,\s+avatar_tone,\s+null,\s+null,/);
assert.match(installSql, /nickname_moods text\[\] := array\[[\s\S]*?'웃고있는'[\s\S]*?'느긋한'/);
assert.match(installSql, /nickname_animals text\[\] := array\[[\s\S]*?'기린'[\s\S]*?'카피바라'/);
assert.match(installSql, /desired_nickname := nickname_moods\[[\s\S]*?\] \|\| nickname_animals\[/);
assert.match(installSql, /visit_index := window_index/g);
assert.match(installSql, /study_date::text \|\| ':nickname-animal-base'/);
assert.match(installSql, /right\(agent\.student_id, 1\)::integer - 1/);

assert.match(installSql, /at time zone 'Asia\/Seoul'/);
assert.match(installSql, /study_clock := local_clock - interval '4 hours'/);
assert.match(installSql, /study_minutes := 50 \+ private\.study_cafe_agent_jitter/);
assert.match(installSql, /break_minutes := 6 \+ private\.study_cafe_agent_jitter/);
assert.match(installSql, /candidate_started_at := p_now - make_interval/);
assert.match(installSql, /select max\(sessions\.ended_at\)/);
assert.match(installSql, /candidate_started_at, candidate_started_at, p_now/);
assert.match(installSql, /29\s*\) - 14/g);
assert.match(installSql, /'\* \* \* \* \*'/);
assert.match(installSql, /where end_time < now\(\) - interval '7 days'/);
assert.match(installSql, /and jobid in \([\s\S]*?'study-cafe-agents-every-minute'/);

assert.match(installSql, /insert into public\.study_cafe_presence/);
assert.match(installSql, /agent\.avatar_tone, desired_nickname, p_now, p_now/);
assert.match(installSql, /insert into public\.study_cafe_sessions/);
assert.match(installSql, /last_heartbeat_at = excluded\.last_heartbeat_at/);
assert.match(installSql, /exception when unique_violation/);
assert.match(installSql, /from generate_series\(1, 48\) as candidate\(seat\)/);
assert.doesNotMatch(installSql, /from generate_series\(1, 96\) as candidate\(seat\)/);
assert.match(installSql, /revoke all on schema private from public, anon, authenticated/);
assert.match(installSql, /alter table private\.study_cafe_agents enable row level security/);
assert.match(installSql, /create policy study_cafe_agents_deny_client_access/);
assert.match(installSql, /as restrictive[\s\S]*?to anon, authenticated[\s\S]*?using \(false\)[\s\S]*?with check \(false\)/);

assert.match(pauseSql, /set enabled = false/);
assert.match(pauseSql, /run_study_cafe_agents\(now\(\)\)/);
assert.doesNotMatch(pauseSql, /delete from public\.students/);
assert.match(verifySql, /cron\.job_run_details/);

console.log("study cafe agent SQL tests passed");
