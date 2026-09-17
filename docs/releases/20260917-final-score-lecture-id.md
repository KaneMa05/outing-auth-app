# Final exam identity release — 2026-09-17

- Production: https://app.ronparkpass.com
- Deployment: `dpl_5kghqrTycTw2qCc9YXKUUfsa6tLj`
- Deployed source commit: `37de805`
- Release branch: `release/final-score-lecture-id-20260917`
- Previous production / rollback target: `dpl_HCkpKUHLKaUoRbZmdCSHkyo6qFTZ`
- Captured production baseline commit: `5bd85ad`

The release adds administrator-only lecture account matching for final exam
imports. Existing student primary keys and public score payloads remain unchanged.
The latest deployed student grade performance improvement is preserved. Criminal
law OX and study record sharing work in the main working directory is excluded.

Applied only `20260917042923_final_score_lecture_identities.sql`. The local filename
was aligned with the actual Supabase migration history after deployment; SQL is
unchanged from the reviewed migration. RLS is enabled, browser roles have no table
privileges, and service_role has SELECT and INSERT only. The advisor's no-policy
notice for this table is intentional: all browser access must remain denied.

Validation: full npm test, isolated PGlite identity uniqueness/privacy tests, and
production configuration build passed. Nine served assets match the release;
student and existing administrator entry assets match the previous production.
All 44 service worker shell resources return HTTP 200. Unauthenticated identity
API requests and anonymous database reads are denied. Existing 233 score records
had the same content fingerprint before and after the migration:
`878b17bb5b731fda9a44b738fedad98a`.

The supplied 123-row file passed import parsing checks. It was not imported into
production. Actual administrator score submission after deployment remains a user
operation. Administrators should refresh open tabs before importing.

Application rollback does not undo the database migration or score submissions.
The additive private identity table is compatible with the previous application.
Future releases must start from or include this release branch and preserve later
production changes. The main working directory contains unrelated unfinished work;
do not deploy it wholesale. No Git push was performed for this release.
