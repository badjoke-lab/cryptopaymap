import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const pages = [
  {
    path: 'admin/media/index.html',
    required: [
      'Media review boundary',
      'Private until reviewed',
      'Protected Media queue',
      'Version-pinned files and storage state',
    ],
  },
  {
    path: 'admin/media/detail/index.html',
    required: [
      'Protected visual review',
      'Do not copy private review files',
      'Exact Media decision workspace',
      'Protected preview · no-store',
    ],
  },
];

for (const page of pages) {
  const absolutePath = join('dist', page.path);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing Media review artifact: ${page.path}`);
  }
  const content = readFileSync(absolutePath, 'utf8');
  for (const fragment of page.required) {
    if (!content.includes(fragment)) {
      throw new Error(`Missing Media review marker in ${page.path}: ${fragment}`);
    }
  }
  for (const forbidden of [
    'CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS',
    'CPM_MEDIA_PRIVATE_BUCKET',
    'CPM_MEDIA_PUBLIC_BUCKET',
    'DATABASE_URL',
    'requestFingerprint',
    'storageKey',
    'actorId',
  ]) {
    if (content.includes(forbidden)) {
      throw new Error(`Private Media review marker found in ${page.path}: ${forbidden}`);
    }
  }
}

console.log('Media review artifact checks passed.');
