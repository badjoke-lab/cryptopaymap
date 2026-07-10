import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const detailPage = readFileSync(join('dist', 'admin/submissions/detail/index.html'), 'utf8');

const requiredFragments = [
  'Time-bounded review pause',
  'Place review on Hold',
  '30 / 60 / 90 days only',
  'Every Hold records an internal reason, a required action, a safe public status message, and a server-computed next review date.',
  'Indefinite Hold is not available.',
];

for (const fragment of requiredFragments) {
  if (!detailPage.includes(fragment)) {
    throw new Error(`Missing Suggest Hold staging marker: ${fragment}`);
  }
}

const forbiddenFragments = [
  'CPM_ADMIN_SUBMISSION_TRANSITION_SUBJECTS',
  'DATABASE_URL',
  'statusTokenHash',
  'requestFingerprint',
  'encryptedEmail',
  'emailHash',
];

for (const fragment of forbiddenFragments) {
  if (detailPage.includes(fragment)) {
    throw new Error(`Private or server-only Hold marker found in HTML: ${fragment}`);
  }
}

console.log('Suggest Hold staging artifact checks passed.');
