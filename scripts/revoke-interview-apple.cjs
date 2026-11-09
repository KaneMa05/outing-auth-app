'use strict';
// Operator step for an authenticated account-deletion request. Never log grants/keys.
const apple = require('../lib/interview-apple-auth');
const {requestSupabase} = require('../api/curriculum')._private;
async function revokeOwner(owner, {cfg = apple.config({...process.env, INTERVIEW_APPLE_ENABLED: 'true'}), request = requestSupabase, revoke = apple.revoke} = {}) {
  if (!cfg.enabled || typeof owner !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(owner)) throw Error('Valid owner and complete Apple server configuration required');
  const rows = await request('GET', 'ip_web_identities?owner_id=eq.' + encodeURIComponent(owner) + '&provider=eq.apple&select=id,app_id,subject');
  let count = 0;
  for (const row of rows) {
    if (row.app_id !== 'apple:' + cfg.clientId) throw Error('Configure the original Apple Services ID before revoking this account');
    const grants = await request('GET', 'ip_apple_grants?identity_id=eq.' + encodeURIComponent(row.id) + '&select=encrypted_refresh_token');
    if (grants[0]) await revoke(grants[0].encrypted_refresh_token, cfg, row.subject);
    await request('DELETE', 'ip_web_sessions?identity_id=eq.' + encodeURIComponent(row.id));
    await request('DELETE', 'ip_apple_grants?identity_id=eq.' + encodeURIComponent(row.id));
    count++;
  }
  return {revokedAppleIdentities: count, accountDataDeleted: false};
}
module.exports = {revokeOwner};
if (require.main === module) {
  const args = process.argv.slice(2), index = args.indexOf('--owner');
  if (!args.includes('--confirm-revoke') || index < 0 || !args[index + 1]) {
    console.error('Usage: node --env-file=.env.local scripts/revoke-interview-apple.cjs --owner OWNER_ID --confirm-revoke'); process.exitCode = 1;
  } else revokeOwner(args[index + 1]).then(result => console.log(JSON.stringify(result))).catch(() => {
    console.error('Apple revocation did not finish. Keep the identity and encrypted grant until the operator resolves the failure.'); process.exitCode = 1;
  });
}
