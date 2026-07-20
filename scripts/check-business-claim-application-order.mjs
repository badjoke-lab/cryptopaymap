import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

const registration = read('src/admin/submissions/application-registration.ts');
assert.match(registration, /businessClaimPaymentApplicationPending\?: boolean/);
assert.match(registration, /businessClaimPaymentApplicationPending === true/);

const backend = read('src/admin/submissions/drizzle-application-registration-backend.ts');
assert.match(backend, /parseBusinessClaimFieldApplicationEventPayload/);
assert.match(backend, /acceptedProposals\.length/);
assert.match(backend, /Business Claim field-application event payload is invalid/);

const fieldBackend = read(
  'src/admin/submissions/drizzle-business-claim-field-application-backend.ts',
);
assert.doesNotMatch(fieldBackend, /insert\(claimAssets\)/);
assert.doesNotMatch(fieldBackend, /insert\(provenanceLinks\)/);

const status = read('docs/PROJECT_STATUS.md');
assert.match(status, /P5-07E1/);
assert.match(status, /P5-07D7.*#254/);

console.log('P5-07E1 Business Claim application-order check passed.');
