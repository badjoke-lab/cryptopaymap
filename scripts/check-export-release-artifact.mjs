import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const pages = [
  {
    path: 'admin/exports/index.html',
    required: [
      'Public export boundary',
      'Validate before release',
      'Protected release workspace',
      'Private candidate · durable history',
    ],
  },
  {
    path: 'admin/exports/detail/index.html',
    required: [
      'Release decision boundary',
      'Approval does not deploy artifacts',
      'Exact snapshot decision',
      'Server revalidation · idempotent receipt',
    ],
  },
];

for (const page of pages) {
  const absolutePath = join('dist', page.path);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing export release artifact: ${page.path}`);
  }
  const content = readFileSync(absolutePath, 'utf8');
  for (const fragment of page.required) {
    if (!content.includes(fragment)) {
      throw new Error(`Missing export release marker in ${page.path}: ${fragment}`);
    }
  }
  for (const forbidden of [
    'CPM_ADMIN_EXPORT_RELEASE_ACTOR_IDS',
    'CPM_EXPORT_CANDIDATE_BUCKET',
    'CPM_EXPORT_CANDIDATE_KEY',
    'DATABASE_URL',
    'requestFingerprint',
    'actorId',
    'internalNote',
  ]) {
    if (content.includes(forbidden)) {
      throw new Error(`Private export release marker found in ${page.path}: ${forbidden}`);
    }
  }
}

console.log('Export release artifact checks passed.');
