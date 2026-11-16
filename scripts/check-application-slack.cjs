const { notifyApplicationSubmitted } = require('../lib/application-slack');

const channels = [
  { kind: 'written', name: '필기반-앱', key: 'SLACK_WRITTEN_APPLICATION_WEBHOOK_URL' },
  { kind: 'interview', name: '면접반-앱', key: 'SLACK_INTERVIEW_APPLICATION_WEBHOOK_URL' },
];

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--send-test') || args.length > 1) {
    console.error('Usage: npm run check:application-slack -- [--send-test]');
    process.exitCode = 1;
    return;
  }

  const marker = `slack-test-${Date.now()}`;
  const application = {
    id: marker,
    name: `연동 테스트 · 실제 신청 아님 (${marker})`,
    track: '전송 경로 확인',
    course_type: 'offline',
    exam_number: 'TEST-ONLY',
    revision: 1,
    created_at: new Date().toISOString(),
  };

  // Run the production sender with a local fetch stub first. This validates
  // both destinations without transmitting data or disclosing the URLs.
  let valid = true;
  for (const channel of channels) {
    let requested = false, failed = false;
    await notifyApplicationSubmitted(channel.kind, application, {
      schedule: () => {},
      fetcher: async () => { requested = true; return new Response('ok'); },
      warn: () => { failed = true; },
    });
    const ready = requested && !failed;
    console.log(`${channel.name}: ${ready ? 'configured' : `missing or invalid ${channel.key}`}`);
    if (!ready) valid = false;
  }
  if (valid && process.env[channels[0].key].trim() === process.env[channels[1].key].trim()) {
    console.error('The two channels must use different webhook URLs.');
    valid = false;
  }
  if (!valid) { process.exitCode = 1; return; }
  if (!args.includes('--send-test')) {
    console.log('Configuration valid. No messages sent. Use --send-test to verify delivery.');
    return;
  }

  console.log(`Test marker: ${marker}`);
  for (const channel of channels) {
    let failed = false;
    await notifyApplicationSubmitted(channel.kind, application, {
      schedule: () => {},
      warn: () => { failed = true; },
    });
    console.log(`${channel.name}: ${failed ? 'delivery_failed' : 'Slack acknowledged (ok)'}`);
    if (failed) process.exitCode = 1;
  }
  console.log('Verify the test marker in each target channel. No application records were created.');
}

main().catch(() => {
  console.error('Slack verification failed. No credentials were printed.');
  process.exitCode = 1;
});
