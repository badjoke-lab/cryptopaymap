import { createSubmissionContactProtectorFromEnvironment } from '../src/submissions/contact-protection-environment';

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

const protector = createSubmissionContactProtectorFromEnvironment({
  CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL: encodeBase64Url(
    new Uint8Array(32).fill(11),
  ),
  CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_ID: 'contact-check-v1',
  CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL: encodeBase64Url(
    new Uint8Array(32).fill(29),
  ),
  CPM_SUBMISSION_CONTACT_RETENTION_DAYS: '30',
});

const receivedAt = new Date('2026-07-11T00:00:00.000Z');
const first = await protector.protectEmail('User@Example.com', receivedAt);
const second = await protector.protectEmail('user@example.com', receivedAt);

if (first.emailHash !== second.emailHash) {
  throw new Error('Submission contact email hash normalization is not deterministic.');
}
if (first.encryptedEmail === second.encryptedEmail) {
  throw new Error('Submission contact encryption must use randomized ciphertext.');
}
if (first.retentionUntil?.toISOString() !== '2026-08-10T00:00:00.000Z') {
  throw new Error('Submission contact retention calculation is incorrect.');
}

console.log('Submission contact protection checks passed.');
