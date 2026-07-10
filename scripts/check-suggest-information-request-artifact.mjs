import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const detailPage = readFileSync(
  join('dist', 'admin/submissions/detail/index.html'),
  'utf8',
);

const requiredFragments = [
  'Submitter follow-up boundary',
  'Request additional information',
  'in review → needs information',
  'Only bounded requested-action text and a public status message are projected to the submitter.',
];

for (const fragment of requiredFragments) {
  if (!detailPage.includes(fragment)) {
    throw new Error(`Missing Suggest information-request staging marker: ${fragment}`);
  }
}

const forbiddenFragments = [
  'CPM_ADMIN_SUBMISSION_TRANSITION_SUBJECTS',
  'DATABASE_URL',
  'internalNote',
  'statusTokenHash',
  'requestFingerprint',
  'encryptedEmail',
  'emailHash',
];

for (const fragment of forbiddenFragments) {
  if (detailPage.includes(fragment)) {
    throw new Error(`Private or server-only information-request marker found in HTML: ${fragment}`);
  }
}

console.log('Suggest information-request staging artifact checks passed.');
