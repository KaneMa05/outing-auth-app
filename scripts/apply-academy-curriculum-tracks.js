const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
for (const filename of [".env", ".env.local"]) {
  const envPath = path.join(root, filename);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

const { loadCurriculum, requestSupabase } = require("../api/curriculum")._private;

const ACADEMY_NAVIGATION_TRACK = "경찰직 - 해경학과 항해(경장)";
const ACADEMY_ENGINE_TRACK = "경찰직 - 해경학과 기관(경장)";
const additions = {
  "criminal-law": [ACADEMY_NAVIGATION_TRACK, ACADEMY_ENGINE_TRACK],
  "navigation-technique": [ACADEMY_NAVIGATION_TRACK],
  "marine-engineering": [ACADEMY_ENGINE_TRACK],
  "maritime-english": [ACADEMY_NAVIGATION_TRACK, ACADEMY_ENGINE_TRACK],
  "coast-guard-intro": [ACADEMY_NAVIGATION_TRACK, ACADEMY_ENGINE_TRACK],
};

async function main() {
  const apply = process.argv.includes("--apply");
  const before = await loadCurriculum({ includeUnpublished: true });
  const originals = new Map(before.map((subject) => [subject.id, subject.targetTracks]));
  for (const subjectId of Object.keys(additions)) {
    if (!originals.has(subjectId)) throw new Error(`Missing curriculum subject: ${subjectId}`);
  }

  if (apply) {
    const changed = [];
    try {
      for (const [subjectId, tracks] of Object.entries(additions)) {
        const targetTracks = [...new Set([...(originals.get(subjectId) || []), ...tracks])];
        await requestSupabase("PATCH", `curriculum_subjects?id=eq.${encodeURIComponent(subjectId)}`, {
          target_tracks: targetTracks,
          updated_at: new Date().toISOString(),
        }, { Prefer: "return=minimal" });
        changed.push(subjectId);
      }
    } catch (error) {
      for (const subjectId of changed.reverse()) {
        await requestSupabase("PATCH", `curriculum_subjects?id=eq.${encodeURIComponent(subjectId)}`, {
          target_tracks: originals.get(subjectId),
          updated_at: new Date().toISOString(),
        }, { Prefer: "return=minimal" }).catch(() => {});
      }
      throw error;
    }
  }

  const catalog = apply ? await loadCurriculum({ includeUnpublished: true }) : before.map((subject) => ({
    ...subject,
    targetTracks: [...new Set([...(subject.targetTracks || []), ...(additions[subject.id] || [])])],
  }));
  for (const track of [ACADEMY_NAVIGATION_TRACK, ACADEMY_ENGINE_TRACK]) {
    const matched = catalog.filter((subject) => subject.targetTracks.includes(track)).map((subject) => subject.name);
    console.log(`${track}: ${matched.join(", ")}`);
  }
  console.log(apply ? "Applied and verified." : "Dry run only. Use --apply to update Supabase.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
