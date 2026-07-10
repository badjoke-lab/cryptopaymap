import { createSubmissionStatusSecretProviderFromEnvironment } from '../src/submissions/status-secret-environment';

const requestId = '20000000-0000-4000-8000-000000000001';
const testKeyBytes = new Uint8Array(32).fill(7);
let testKeyBinary = '';
for (const byte of testKeyBytes) testKeyBinary += String.fromCharCode(byte);
const provider = createSubmissionStatusSecretProviderFromEnvironment({
  CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL: btoa(testKeyBinary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, ''),
});
const first = await provider.issueForRequest(requestId);
const replay = await provider.issueForRequest(requestId);

if (first.secret !== replay.secret || first.tokenHash !== replay.tokenHash) {
  throw new Error('Submission status-secret environment binding is not deterministic.');
}

console.log('Submission status-secret environment binding checks passed.');
