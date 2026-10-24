const { createHash } = require('node:crypto');
const config = require('../interview-preview-config.json');

// This list limits the pilot audience; device authentication and enrollment
// remain mandatory. Empty/malformed configuration denies all students.
function getPreviewHashes() {
  const hashes = config.studentIdHashes;
  return Array.isArray(hashes) && hashes.every(value =>
    typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)) ? hashes : [];
}

function isPreviewStudent(studentId) {
  if (typeof studentId !== 'string' || !studentId) return false;
  const hash = createHash('sha256').update('interview-preview-v1:' + studentId).digest('hex');
  return getPreviewHashes().includes(hash);
}

module.exports = { getPreviewHashes, isPreviewStudent };
