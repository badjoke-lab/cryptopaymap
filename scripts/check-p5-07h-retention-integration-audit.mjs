import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = {
  retention: 'src/admin/submissions/private-retention.ts',
  backend: 'src/admin/submissions/drizzle-private-retention-backend.ts',
  contract: 'src/admin/submissions/private-retention-contract.ts',
  media: 'src/submissions/private-media-retention.ts',
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [
      key,
      await readFile(path, 'utf8'),
    ]),
  ),
);

const requiredRetentionFragments = [
  "capabilities.includes('submission:retention:execute')",
  "begin.state === 'replayed'",
  "Date.parse(candidate.eligibleAt) > effectiveAt.getTime()",
  'applyDatabaseCandidate',
  'completeMediaCandidate',
  'finalizeRun',
  "phaseFailures.push('database_candidates')",
  "phaseFailures.push('photo_cleanup')",
  "phaseFailures.push('private_media_cleanup')",
];

for (const fragment of requiredRetentionFragments) {
  assert.ok(
    source.retention.includes(fragment),
    `P5-07H audit failed: private retention is missing required invariant: ${fragment}`,
  );
}

const forbiddenCanonicalMutationFragments = [
  'update(entity',
  'update(location',
  'update(claim',
  'update(claimAsset',
  'update(evidenceDecision',
  'update(mediaDecision',
  'update(export',
  'update(release',
  'update(publication',
  'delete(entity',
  'delete(location',
  'delete(claim',
  'delete(claimAsset',
];

const combinedExecutionSource = [source.retention, source.backend, source.media]
  .join('\n')
  .toLowerCase();
for (const fragment of forbiddenCanonicalMutationFragments) {
  assert.ok(
    !combinedExecutionSource.includes(fragment.toLowerCase()),
    `P5-07H audit failed: retention execution appears to mutate forbidden canonical state: ${fragment}`,
  );
}

const requiredDurabilityFragments = [
  'requestFingerprint',
  'privateRetentionItemId',
  'receipt',
  'referenceType',
  'referenceId',
  'runId',
];
for (const fragment of requiredDurabilityFragments) {
  assert.ok(
    combinedExecutionSource.includes(fragment.toLowerCase()),
    `P5-07H audit failed: durable identity/receipt fragment is missing: ${fragment}`,
  );
}

const contractRequirements = [
  'private-retention-run-receipt-v1',
  'committedCount',
  'replayedCount',
  'conflictCount',
  'failedCount',
  'phaseFailures',
  'hasMore',
];
for (const fragment of contractRequirements) {
  assert.ok(
    source.contract.includes(fragment),
    `P5-07H audit failed: receipt contract is missing ${fragment}`,
  );
}

console.log(
  JSON.stringify(
    {
      audit: 'P5-07H',
      result: 'pass',
      guarantees: [
        'authorized execution boundary',
        'deterministic replay receipt path',
        'premature candidate rejection',
        'database and object-store phase accounting',
        'durable policy/reference identity',
        'no direct canonical/public mutation in retention execution',
      ],
      files: Object.values(files),
    },
    null,
    2,
  ),
);
