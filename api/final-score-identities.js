const { randomUUID } = require('node:crypto');
const { COOKIE_NAME, getConfig, hasPermission, readCookie, readSessionToken } = require('./teacher-auth-utils');
const TABLE = 'final_score_identities';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const session = readSessionToken(readCookie(req, COOKIE_NAME), getConfig().secret);
  if (!session) return res.status(401).json({ ok: false, error: 'unauthorized' });
  if (!hasPermission(session, 'grades.read')) return res.status(403).json({ ok: false, error: 'forbidden' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  try {
    const body = await readJson(req);
    const cohort = String(body.cohort || '').trim();
    if (!/^(?:[1-9][0-9]?|lecture)$/.test(cohort)) throw failure('invalid_cohort', 400);
    const entries = normalizeEntries(body.entries);
    const [identities, roster, applications] = await Promise.all([
      loadAll(`${TABLE}?select=cohort,lecture_id_normalized,participant_id,student_id&cohort=eq.${encodeURIComponent(cohort)}&order=lecture_id_normalized.asc`),
      loadAll('students?select=id,name,track,cohort,student_category&account_type=eq.student&is_active=eq.true&order=id.asc'),
      loadApplications(entries.map(entry => entry.lectureId)),
    ]);
    const students = roster.filter(student => studentCohort(student) === cohort);
    const plan = planMatches(entries, students, applications, identities, cohort);
    if (plan.issues.length) return res.status(200).json({ ok: true, ...plan });

    const known = new Set(identities.map(identity => identity.lecture_id_normalized));
    const additions = entries.flatMap((entry, index) => known.has(entry.lectureId) ? [] : [{
      cohort,
      lecture_id_normalized: entry.lectureId,
      participant_id: plan.students[index].id,
      student_id: plan.students[index].isExternalFinalScore ? null : plan.students[index].id,
      created_by: String(session.username || 'admin').slice(0, 100),
    }]);
    if (additions.length) {
      await requestSupabase('POST', `${TABLE}?on_conflict=cohort,lecture_id_normalized`, additions,
        { Prefer: 'resolution=ignore-duplicates,return=minimal' });
    }
    // Concurrent imports can create a mapping first. Always use the persisted ID.
    const saved = await loadAll(`${TABLE}?select=cohort,lecture_id_normalized,participant_id,student_id&cohort=eq.${encodeURIComponent(cohort)}&order=lecture_id_normalized.asc`);
    if (additions.some(addition => {
      const persisted = saved.find(row => row.lecture_id_normalized === addition.lecture_id_normalized);
      return persisted && persisted.student_id !== addition.student_id;
    })) throw failure('identity_save_conflict', 409);
    const persisted = planMatches(entries.map(({ resolved, ...entry }) => entry), students, applications, saved, cohort);
    if (persisted.issues.length || entries.some(entry => !saved.some(row => row.lecture_id_normalized === entry.lectureId))) {
      throw failure('identity_save_conflict', 409);
    }
    return res.status(200).json({ ok: true, students: persisted.students, choices: [], issues: [] });
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, error: error.publicCode || 'identity_store_error', row: error.row || null });
  }
};

function failure(code, status = 400, row = null) {
  const error = new Error(code);
  Object.assign(error, { publicCode: code, status, row });
  return error;
}

function normalizeEntries(value) {
  if (!Array.isArray(value) || !value.length || value.length > 500) throw failure('invalid_entries');
  const seen = new Set();
  return value.map((entry, index) => {
    const lectureId = String(entry.lectureId || '').trim().toLowerCase();
    const name = String(entry.name || '').trim();
    const track = String(entry.track || '').trim();
    if (!lectureId || lectureId.length > 80 || /[\s\x00-\x1f]/.test(lectureId) || !name || name.length > 100 || track.length > 100) throw failure('invalid_identity', 400, index + 1);
    if (seen.has(lectureId)) throw failure('duplicate_lecture_id', 400, index + 1);
    seen.add(lectureId);
    const resolved = entry.resolved ? { id: String(entry.resolved.id || ''), external: entry.resolved.external === true } : null;
    return { lectureId, name, track, resolved };
  });
}

function studentCohort(student) {
  if (student.student_category === 'lecture') return 'lecture';
  if (student.cohort != null) return String(student.cohort);
  const id = String(student.id || '');
  return /^\d{4,5}$/.test(id) ? id.slice(0, -3) : '';
}

function planMatches(entries, roster, applications, identities, cohort) {
  const byId = new Map(roster.map(student => [String(student.id), student]));
  const byLectureId = new Map(identities.map(identity => [identity.lecture_id_normalized, identity]));
  const claimed = new Map(identities.map(identity => [identity.participant_id, identity.lecture_id_normalized]));
  const issues = new Set();
  const choices = [];
  const external = entry => ({ id: `external-${randomUUID()}`, name: entry.name, track: entry.track, finalScoreCohort: cohort, isExternalFinalScore: true });
  const registered = student => ({ id: String(student.id), name: student.name, track: student.track || '', isExternalFinalScore: false });
  const students = entries.map((entry, index) => {
    const existing = byLectureId.get(entry.lectureId);
    const candidateRows = roster.filter(student => student.name === entry.name && (!entry.track || student.track === entry.track));
    choices[index] = candidateRows.filter(student => !claimed.has(String(student.id)) || claimed.get(String(student.id)) === entry.lectureId).map(registered);
    if (existing) {
      if (existing.student_id && !byId.has(existing.student_id)) throw failure('linked_student_not_in_cohort', 409, index + 1);
      return existing.student_id ? registered(byId.get(existing.student_id)) : { ...external(entry), id: existing.participant_id };
    }
    if (entry.resolved) {
      if (entry.resolved.external) return external(entry);
      const selected = choices[index].find(student => student.id === entry.resolved.id);
      if (!selected) throw failure('invalid_student_selection', 400, index + 1);
      return selected;
    }
    const approved = applications.filter(application => application.lecture_id_normalized === entry.lectureId);
    const approvedIds = [...new Set(approved.map(application => String(application.approved_student_id || '')).filter(Boolean))];
    if (approvedIds.length === 1) {
      const id = approvedIds[0];
      if (!byId.has(id)) return external(entry);
      if (claimed.has(id) && claimed.get(id) !== entry.lectureId) throw failure('student_identity_conflict', 409, index + 1);
      return registered(byId.get(id));
    }
    if (approvedIds.length > 1 || choices[index].length > 1 || (candidateRows.length && !choices[index].length)) issues.add(index);
    if (choices[index].length === 1) return choices[index][0];
    return external(entry);
  });
  const studentRows = new Map();
  students.forEach((student, index) => {
    if (studentRows.has(student.id)) {
      issues.add(studentRows.get(student.id));
      issues.add(index);
    } else studentRows.set(student.id, index);
  });
  return { students, choices, issues: [...issues].sort((a, b) => a - b) };
}

async function loadApplications(ids) {
  const applications = [];
  for (let offset = 0; offset < ids.length; offset += 40) {
    const filter = ids.slice(offset, offset + 40).map(id => `"${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
    applications.push(...await loadAll(`lecture_applications?select=lecture_id_normalized,approved_student_id&status=eq.approved&lecture_id_normalized=in.${encodeURIComponent(`(${filter})`)}&order=id.asc`));
  }
  return applications;
}

async function loadAll(query) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await requestSupabase('GET', `${query}&offset=${offset}&limit=1000`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function requestSupabase(method, path, body, headers = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw failure('service_role_not_configured', 503);
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...headers },
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 404) throw failure('identity_table_unavailable', 503);
    if (response.status === 409) throw failure('student_identity_conflict', 409);
    throw failure('identity_store_error', 502);
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

module.exports._private = { normalizeEntries, studentCohort, planMatches };
