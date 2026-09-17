# Study record sharing and registered-student OX release — 2026-09-17

- Production: https://app.ronparkpass.com
- Deployment: `dpl_GzVJ8xHPqNse1T73UBrSEY3D4pNB` (READY, production domains assigned)
- Deployed source commit: `1ac8c6a`
- Base deployment / rollback target: `dpl_5kghqrTycTw2qCc9YXKUUfsa6tLj`
- Base source: `176cca7` (includes deployed `37de805` and its release record)
- Release branch: `release/study-share-ox-members-20260917`
- User approved deployment with “진행” after reviewing the registration behavior.

Study record sharing is included in the existing timer statistics screen. OX is
deployed with learning disabled and no students enrolled. Only administrators can
register existing students; learning must also be enabled before those students
can use it. Registration is required for every learning request, not only the
home button. Revocation preserves previous learning records and notes.

Applied `20260917124608_criminal_law_ox.sql` and
`20260917124623_criminal_law_ox_members.sql`. Local filenames were aligned with
actual migration history without changing SQL. Imported 2,960 questions across
65 chapters: 2,543 published-question records and 417 drafts. The global switch
remains **off**, so published-question records are not available to students.
No existing student, final score, or final score identity rows were modified.

Validation: full npm test on the isolated LF checkout, OX SQL/API permission and
record-preservation tests, and chapter flow tests passed. The earlier browser QA
checked registration/revocation and access for all three student categories at
390px/1100px. Production source was compared with the base branch before release;
existing student grade performance and administrator score matching are preserved.

Security Advisor returned informational no-policy notices only. All nine OX
tables have RLS and deny browser roles direct access; the OX function is callable
only by the server role. This is intentional for this server-only API design.
[Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Before release, final scores contained 237 rows, fingerprint
`007f5ec02a8c74229da9c72635303f2d`; the private identity table contained 114 rows.
Application rollback does not undo the additive OX tables; they remain compatible
with the previous application while OX is disabled.

Administrator workflow: 형사법 OX 관리 → 이용 수강생 관리 → 전체 수강생 · 등록하기
→ search by name/student ID → OX 등록 → 등록 수강생 학습 시작 when ready.

Production verification completed at 2026-09-17 12:50 UTC: all 14 checked source
assets match the validated release, all 49 service worker resource requests return
HTTP 200, public configuration is unchanged, and internal docs/SQL/import sources
return 404. Unauthenticated OX requests and anonymous OX table reads are denied.
Server status checks for each student category return disabled. OX registration
and learning remain off until the administrator explicitly chooses users and
starts learning. Final scores and private identity counts/fingerprint were checked
again after deployment. No Git push was performed; Vercel was deployed directly.

The post-deployment counts remain 329 students, 237 final scores and 114 private
identities; the final-score fingerprint is unchanged. Future releases must start
from this release branch or explicitly preserve its changes. The main working
directory remains an uncommitted development workspace.
