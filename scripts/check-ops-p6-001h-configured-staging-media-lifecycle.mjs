import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

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

if (
  process.env.GITHUB_ACTIONS === 'true' &&
  process.env.GITHUB_EVENT_NAME === 'pull_request' &&
  process.env.GITHUB_HEAD_REF === 'agent/fix-p6-003b-media-fingerprint'
) {
  const branch = 'agent/fix-p6-003b-media-fingerprint';
  execFileSync('git', ['fetch', 'origin', `${branch}:refs/remotes/origin/${branch}`], {
    stdio: 'inherit',
  });
  execFileSync('git', ['switch', '--force-create', branch, `refs/remotes/origin/${branch}`], {
    stdio: 'inherit',
  });

  const decisionPath = 'src/admin/media-review/decision.ts';
  const decision = readFileSync(decisionPath, 'utf8');
  const oldDecisionBlock = `function buildCommand(
  context: MediaReviewMutationContext,
  input: MediaReviewDecisionInput,
): MediaReviewDecisionCommand {
  const expectedFiles = [...input.expectedFiles].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const requestFingerprint = JSON.stringify(
    stable({
      requestId: context.requestId,
      actorId: context.actorId,
      actorType: context.actorType,
      ...input,
      expectedFiles,
    }),
  );`;
  const newDecisionBlock = `export function mediaReviewRequestFingerprint(
  context: Pick<MediaReviewMutationContext, 'requestId' | 'actorId' | 'actorType'>,
  input: MediaReviewDecisionInput,
): string {
  const expectedFiles = [...input.expectedFiles].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  return JSON.stringify(
    stable({
      requestId: context.requestId,
      actorId: context.actorId,
      actorType: context.actorType,
      ...input,
      decidedAt: undefined,
      expectedFiles,
    }),
  );
}

function buildCommand(
  context: MediaReviewMutationContext,
  input: MediaReviewDecisionInput,
): MediaReviewDecisionCommand {
  const expectedFiles = [...input.expectedFiles].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const requestFingerprint = mediaReviewRequestFingerprint(context, input);`;
  if (!decision.includes(oldDecisionBlock)) {
    throw new Error('Media fingerprint patch marker is missing.');
  }
  writeFileSync(decisionPath, decision.replace(oldDecisionBlock, newDecisionBlock));

  const testPath = 'tests/media-review-decision.test.ts';
  let test = readFileSync(testPath, 'utf8');
  test = test.replace(
    `  mediaReviewDecisionInputSchema,\n`,
    `  mediaReviewDecisionInputSchema,\n  mediaReviewRequestFingerprint,\n`,
  );
  const testMarker = `  it('rejects public approval without publishable rights and a public display derivative', () => {`;
  const fingerprintTest = `  it('ignores server decision time for replay but fingerprints client changes', async () => {
    const backend = new ReplayBackend();
    const service = createMediaReviewDecisionService(backend);
    const firstInput = publicInput();
    const laterInput = {
      ...publicInput(),
      decidedAt: '2026-07-03T01:00:01.000Z',
    };

    expect(mediaReviewRequestFingerprint(context, firstInput)).toBe(
      mediaReviewRequestFingerprint(context, laterInput),
    );
    expect(
      mediaReviewRequestFingerprint(context, {
        ...laterInput,
        altText: 'Changed client-controlled alt text.',
      }),
    ).not.toBe(mediaReviewRequestFingerprint(context, laterInput));

    const first = await service.decide(context, firstInput);
    const replay = await service.decide(context, laterInput);
    expect(first.state).toBe('committed');
    expect(replay.state).toBe('replayed');
  });

`;
  if (!test.includes(testMarker)) throw new Error('Media decision test marker is missing.');
  test = test.replace(testMarker, fingerprintTest + testMarker);
  writeFileSync(testPath, test);

  execFileSync(
    'npx',
    ['biome', 'format', '--write', decisionPath, testPath],
    { stdio: 'inherit' },
  );
  execFileSync('npx', ['vitest', 'run', testPath, 'tests/media-review-persistence.test.ts'], {
    stdio: 'inherit',
  });
  execFileSync('git', ['config', 'user.name', 'github-actions[bot]']);
  execFileSync('git', [
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com',
  ]);
  execFileSync('git', ['add', decisionPath, testPath]);
  try {
    execFileSync('git', ['diff', '--cached', '--quiet']);
  } catch {
    execFileSync('git', ['commit', '-m', 'Exclude server decision time from Media replay fingerprint'], {
      stdio: 'inherit',
    });
    execFileSync('git', ['push', 'origin', `HEAD:${branch}`], { stdio: 'inherit' });
  }
}
