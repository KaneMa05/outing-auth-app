// Local evidence only. Does not publish pages, submit Play declarations or delete data.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const artifact = name => path.join(root, 'artifacts/play-console', name);
const status = JSON.parse(fs.readFileSync(artifact('registration-status.json'), 'utf8'));
status.pending = [
  'Final approval required before deploying the policy pages, student My links and assetlinks.',
  'Publish from an isolated copy of current production with only reviewed Play changes; unrelated workspace edits must not be shipped.',
  'Deletion is an email/manual operator process, not an implemented automatic deletion endpoint. Follow deletion-operations.json.',
  'Verify deployed policy URLs, then update Play privacy URL and finish data safety classifications against the live app.',
  'Android real-device validation and internal tester selection remain outstanding.',
  'Internal test release and review submission have not been authorized or performed.',
];
status.localPolicyFiles = ['account-deletion.html', 'app-privacy.html', 'privacy-pages.css'];
status.localPolicyValidation = {
  studentCategories: ['offline', 'online_managed', 'lecture'],
  linksVerified: true,
  mobilePrivacyPageNoHorizontalOverflow: true,
  isolatedConfigBuildPassed: true,
  rootBuildNotRun: true,
  tests: ['student-categories', 'student-faq', 'student-devices-api', 'refresh-safety', 'release-safety'],
};
status.policyOperations = {
  resultNoticeDaysFromReceipt: 10,
  handlingRecordDaysAfterCompletion: 30,
  backupMaximumDaysAfterDeletion: 30,
  supabasePlanVerified: 'pro',
  scheduledBackupsObserved: '2026-10-13 through 2026-10-19',
  pointInTimeRecoveryEnabled: false,
  automaticDeletionImplemented: false,
  operatorMustAlsoCheckManualExports: true,
};
fs.writeFileSync(artifact('registration-status.json'), JSON.stringify(status, null, 2) + '\n');
const data = JSON.parse(fs.readFileSync(artifact('data-safety-review.json'), 'utf8'));
data.releaseBlockers = [
  'Prepared policy pages and student My links await approved deployment and public URL verification.',
  'Operator must implement the published manual deletion procedure, including files, processor copies and manual exports.',
  'Complete required/optional and collection/sharing classifications against live production features.',
  'Update Play privacy URL after approved deployment.',
];
data.reviewAccountsVerified = true;
fs.writeFileSync(artifact('data-safety-review.json'), JSON.stringify(data, null, 2) + '\n');
const preview = fs.readFileSync(path.join(root, 'account-deletion.html'), 'utf8')
  .replace('href="./privacy-pages.css"', 'href="../../privacy-pages.css"')
  .replace('<main>', '<main><aside class="highlight"><strong>공개 전 검토용 초안</strong><p>아직 배포되지 않았습니다. 아래 기간은 공개 후 운영자가 이행할 기준입니다. 자동 계정 삭제 기능을 구현한 것은 아닙니다.</p></aside>')
  .replaceAll('href="./index.html', 'href="../../index.html')
  .replace('href="./app-privacy.html"', 'href="../../app-privacy.html"');
fs.writeFileSync(artifact('account-deletion-preview.html'), preview);
console.log('Updated local policy review artifacts. No publication performed.');
