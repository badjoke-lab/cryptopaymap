import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const artifacts = [
  {
    relativePath: 'admin/candidates/existing-target/index.html',
    label: 'existing-target',
    requiredFragments: [
      'Existing-target boundary',
      'Reuse canonical identity without rewriting it',
      'Search and comparison workspace',
      'Exact target snapshot',
    ],
  },
  {
    relativePath: 'admin/candidates/location-correction/index.html',
    label: 'Location correction',
    requiredFragments: [
      'Location profile correction',
      'Correction boundary',
      'Candidate source set, Location version, field diff, and correction provenance',
      'Reviewed Location correction workspace',
      'Atomic correction',
    ],
  },
];

const forbiddenFragments = [
  'CPM_ADMIN_CANDIDATE_SUBJECTS',
  'CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS',
  'CPM_ADMIN_LOCATION_CORRECT_SUBJECTS',
  'DATABASE_URL',
  'requestFingerprint',
  'actorId',
];

for (const artifact of artifacts) {
  const absolutePath = join('dist', artifact.relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing ${artifact.label} artifact: ${artifact.relativePath}`);
  }

  const content = readFileSync(absolutePath, 'utf8');
  for (const fragment of artifact.requiredFragments) {
    if (!content.includes(fragment)) {
      throw new Error(`Missing ${artifact.label} marker: ${fragment}`);
    }
  }
  for (const fragment of forbiddenFragments) {
    if (content.includes(fragment)) {
      throw new Error(`Private or server-only marker found in ${artifact.label} HTML: ${fragment}`);
    }
  }
}

console.log('Candidate existing-target and Location correction artifact checks passed.');
