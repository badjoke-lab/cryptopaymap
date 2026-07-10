import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const detailPage = readFileSync(join('dist', 'admin/submissions/detail/index.html'), 'utf8');

const requiredFragments = [
  'Private review-material outcome',
  'Accept as private Candidate',
  'No canonical or public mutation',
  'Use this only when the normalized Suggest is useful review material but not sufficient canonical truth.',
  'The transaction creates a private source observation and Candidate, links them as origin material, and resolves the Submission as accepted as Candidate.',
];

for (const fragment of requiredFragments) {
  if (!detailPage.includes(fragment)) {
    throw new Error(`Missing accepted-as-Candidate staging marker: ${fragment}`);
  }
}

const forbiddenFragments = [
  'CPM_ADMIN_SUBMISSION_CANDIDATE_SUBJECTS',
  'CPM_USER_SUBMISSION_SOURCE_ID',
  'DATABASE_URL',
  'statusTokenHash',
  'requestFingerprint',
  'encryptedEmail',
  'emailHash',
  'originalPayload',
];

for (const fragment of forbiddenFragments) {
  if (detailPage.includes(fragment)) {
    throw new Error(`Private or server-only Candidate marker found in HTML: ${fragment}`);
  }
}

console.log('Suggest accepted-as-Candidate staging artifact checks passed.');
