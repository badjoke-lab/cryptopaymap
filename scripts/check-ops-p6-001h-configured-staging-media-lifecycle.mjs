import { readFileSync } from 'node:fs';

const files = {
  workflow: readFileSync(
    '.github/workflows/ops-p6-001h-configured-staging-p6-04-media-lifecycle.yml',
    'utf8',
  ),
  procedure: readFileSync('docs/OPS_P6_001H_CONFIGURED_STAGING_P6_04_MEDIA_LIFECYCLE.md', 'utf8'),
  executor: readFileSync('scripts/run-ops-p6-001h-configured-staging-media-lifecycle.ts', 'utf8'),
  worker: readFileSync('workers/submission-rate-limit/index.ts', 'utf8'),
  adminRoute: readFileSync('functions/admin/api/staging-media-object.ts', 'utf8'),
  publicRoute: readFileSync('functions/media/staging/[[path]].ts', 'utf8'),
  decision: readFileSync('src/admin/media-review/decision.ts', 'utf8'),
  writer: readFileSync('src/admin/media-review/http-decision-writer.ts', 'utf8'),
  wrangler: readFileSync('wrangler.jsonc', 'utf8'),
  authorization: readFileSync(
    '.github/workflows/ops-p6-001c-configured-staging-authorization.yml',
    'utf8',
  ),
};

const expectations = [
  [files.workflow, 'EXECUTE_CONFIGURED_STAGING_P6_04'],
  [files.workflow, 'p6-04-r2-media-lifecycle-receipt.json'],
  [files.workflow, 'Enforce configured P6-04 acceptance'],
  [files.procedure, 'mode: durable_object_staging_media'],
  [files.procedure, 'production/default storage implementation remains R2'],
  [files.executor, 'configured_media_lifecycle:failed'],
  [files.executor, 'verify_partial_failure_cleanup'],
  [files.executor, 'Changed replay content.'],
  [files.executor, 'displayStatusAfterTakedown'],
  [files.worker, 'staging_media_objects'],
  [files.worker, 'invalid_media_bytes'],
  [files.worker, 'X-CPM-Image-Width'],
  [files.adminRoute, 'Public Media writes require a durable Media decision.'],
  [files.publicRoute, 'media/public/${stagingMediaAssetId}'],
  [files.decision, 'export function mediaReviewRequestFingerprint'],
  [files.decision, 'decidedAt: undefined'],
  [files.writer, 'createStagingDurableObjectMediaBuckets'],
  [files.writer, "environment.CPM_ADMIN_AUTH_MODE === 'derived_staging_service'"],
  [files.wrangler, 'CPM_STAGING_MEDIA_OBJECTS'],
  [files.wrangler, 'CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS'],
  [files.authorization, 'OPS-P6-001H configured staging P6-04 Media lifecycle'],
];

for (const [content, marker] of expectations) {
  if (!content.includes(marker)) {
    throw new Error(`OPS-P6-001H contract marker is missing: ${marker}`);
  }
}

const forbidden = [
  'postgresql://',
  'CPM_REVIEW_SECRET_SEED_BASE64URL=',
  'CPM_R2_SECRET_ACCESS_KEY=',
  'X-Amz-Signature=',
  'configured account debt',
];
for (const [name, content] of Object.entries(files)) {
  for (const marker of forbidden) {
    if (content.includes(marker)) {
      throw new Error(`OPS-P6-001H ${name} contains forbidden retained material: ${marker}`);
    }
  }
}

console.log('OPS-P6-001H configured staging Media lifecycle contract check passed.');
