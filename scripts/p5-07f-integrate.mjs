import { readFileSync, writeFileSync } from 'node:fs';

const prNumber = process.env.PR_NUMBER;
if (typeof prNumber !== 'string' || !/^\d+$/.test(prNumber)) {
  throw new Error('PR_NUMBER is required.');
}

function replaceOnce(path, oldText, newText, label) {
  let source = readFileSync(path, 'utf8');
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) throw new Error(`${label} marker is missing.`);
  source = source.replace(oldText, newText);
  writeFileSync(path, source);
}

const registrationPath = 'src/admin/submissions/application-registration.ts';
replaceOnce(
  registrationPath,
  `  businessClaimFieldApplicationEventId: string | null;\n  businessClaimPaymentApplicationPending?: boolean;\n}`,
  `  businessClaimFieldApplicationEventId: string | null;\n  businessClaimPaymentApplicationPending?: boolean;\n  photoParentMediaDecisionIds?: string[];\n}`,
  'registration photo receipt state',
);
replaceOnce(
  registrationPath,
  `  const applicationReceipt: SubmissionApplicationReceiptReference | null =\n    contract.defaultApplicationStatus === 'committed'`,
  `  if (request.sourceDecisionKind === 'photos_parent_resolution') {\n    const decisionIds = [...(state.photoParentMediaDecisionIds ?? [])].sort((left, right) =>\n      left.localeCompare(right),\n    );\n    if (decisionIds.length === 0 || new Set(decisionIds).size !== decisionIds.length) {\n      throw new SubmissionApplicationRegistrationError(\n        'ineligible',\n        'The Photos parent decision does not bind one exact complete Media review receipt set.',\n      );\n    }\n    return {\n      applicationKind: contract.applicationKind,\n      applicationStatus: 'committed',\n      publicationStatus: 'pending',\n      applicationReceipt: { kind: 'media_review_decision', ids: decisionIds },\n    };\n  }\n\n  const applicationReceipt: SubmissionApplicationReceiptReference | null =\n    contract.defaultApplicationStatus === 'committed'`,
  'registration photo receipt derivation',
);

const backendPath = 'src/admin/submissions/drizzle-application-registration-backend.ts';
replaceOnce(
  backendPath,
  `import { and, asc, eq, sql } from 'drizzle-orm';`,
  `import { and, asc, eq, inArray, sql } from 'drizzle-orm';`,
  'registration backend inArray import',
);
replaceOnce(
  backendPath,
  `  candidatePromotionDecisions,\n  submissionApplicationEvents,`,
  `  candidatePromotionDecisions,\n  mediaReviewDecisions,\n  submissionApplicationEvents,`,
  'registration backend media table import',
);
replaceOnce(
  backendPath,
  `import { parseBusinessClaimFieldApplicationEventPayload } from '../../submissions/business-claim-field-application-persistence-contract';\nimport { SubmissionPersistenceError }`,
  `import { parseBusinessClaimFieldApplicationEventPayload } from '../../submissions/business-claim-field-application-persistence-contract';\nimport { parsePhotoParentResolutionEventPayload } from '../../submissions/photo-parent-resolution-contract';\nimport { SubmissionPersistenceError }`,
  'registration backend parent parser import',
);
replaceOnce(
  backendPath,
  `      return {\n        submissionId: row.submissionId,`,
  `      let photoParentMediaDecisionIds: string[] = [];\n      if (row.eventAction === 'photo_parent_resolution_decided') {\n        const payload = parsePhotoParentResolutionEventPayload(row.eventInternalNote);\n        if (\n          payload === null ||\n          payload.requestId !== row.eventId ||\n          payload.submissionId !== submissionId ||\n          payload.resolution !== row.resolution\n        ) {\n          throw new Error('Photos parent-resolution event payload is invalid.');\n        }\n        photoParentMediaDecisionIds = payload.media\n          .map((item) => item.decisionId)\n          .sort((left, right) => left.localeCompare(right));\n        if (new Set(photoParentMediaDecisionIds).size !== photoParentMediaDecisionIds.length) {\n          throw new Error('Photos parent-resolution event repeats a Media review decision.');\n        }\n        const decisionRows = await database\n          .select({\n            decisionId: mediaReviewDecisions.id,\n            mediaAssetId: mediaReviewDecisions.mediaAssetId,\n            action: mediaReviewDecisions.action,\n            expectedReviewStatus: mediaReviewDecisions.expectedReviewStatus,\n            toReviewStatus: mediaReviewDecisions.toReviewStatus,\n            decidedAt: mediaReviewDecisions.decidedAt,\n          })\n          .from(mediaReviewDecisions)\n          .where(inArray(mediaReviewDecisions.id, photoParentMediaDecisionIds));\n        const decisionById = new Map(decisionRows.map((decision) => [decision.decisionId, decision]));\n        if (decisionById.size !== photoParentMediaDecisionIds.length) {\n          throw new Error('Photos parent resolution is missing a durable Media review decision.');\n        }\n        for (const snapshot of payload.media) {\n          const decision = decisionById.get(snapshot.decisionId);\n          const expectedStatus = snapshot.decision === 'approved' ? 'accepted' : 'rejected';\n          if (\n            decision === undefined ||\n            decision.mediaAssetId !== snapshot.mediaAssetId ||\n            decision.action !== snapshot.decisionAction ||\n            decision.expectedReviewStatus !== 'pending' ||\n            decision.toReviewStatus !== expectedStatus ||\n            decision.decidedAt.toISOString() !== snapshot.decisionDecidedAt\n          ) {\n            throw new Error('Photos parent resolution does not match its durable Media receipt.');\n          }\n        }\n      }\n\n      return {\n        submissionId: row.submissionId,`,
  'registration backend photo receipt load',
);
replaceOnce(
  backendPath,
  `        businessClaimFieldApplicationEventId: businessClaimFieldApplicationEvent?.id ?? null,\n        businessClaimPaymentApplicationPending,\n      };`,
  `        businessClaimFieldApplicationEventId: businessClaimFieldApplicationEvent?.id ?? null,\n        businessClaimPaymentApplicationPending,\n        photoParentMediaDecisionIds,\n      };`,
  'registration backend photo receipt return',
);

const testPath = 'tests/submission-application-registration.test.ts';
replaceOnce(
  testPath,
  `const fieldApplicationEventId = '50000000-0000-4000-8000-000000000001';\nconst updatedAt`,
  `const fieldApplicationEventId = '50000000-0000-4000-8000-000000000001';\nconst mediaDecisionIdA = '60000000-0000-4000-8000-000000000001';\nconst mediaDecisionIdB = '60000000-0000-4000-8000-000000000002';\nconst updatedAt`,
  'registration test media IDs',
);
replaceOnce(
  testPath,
  `  businessClaimFieldApplicationEventId?: string | null;\n  applicationKind:`,
  `  businessClaimFieldApplicationEventId?: string | null;\n  photoParentMediaDecisionIds?: string[];\n  receiptIds?: string[];\n  applicationKind:`,
  'registration test scenario photo fields',
);
replaceOnce(
  testPath,
  `  receiptKind: 'submission_event' | 'candidate_promotion_decision' | null;`,
  `  receiptKind:\n    | 'submission_event'\n    | 'candidate_promotion_decision'\n    | 'media_review_decision'\n    | null;`,
  'registration test receipt kind',
);
replaceOnce(
  testPath,
  `    receiptKind: 'submission_event',\n    receiptId: sourceEventId,\n  },\n];`,
  `    receiptKind: 'media_review_decision',\n    receiptId: null,\n    receiptIds: [mediaDecisionIdA, mediaDecisionIdB],\n    photoParentMediaDecisionIds: [mediaDecisionIdB, mediaDecisionIdA],\n  },\n];`,
  'registration test photo scenario',
);
replaceOnce(
  testPath,
  `    businessClaimFieldApplicationEventId: scenario.businessClaimFieldApplicationEventId ?? null,\n  };`,
  `    businessClaimFieldApplicationEventId: scenario.businessClaimFieldApplicationEventId ?? null,\n    photoParentMediaDecisionIds: scenario.photoParentMediaDecisionIds,\n  };`,
  'registration test state photo field',
);
replaceOnce(
  testPath,
  `        : { kind: scenario.receiptKind, ids: [scenario.receiptId] },`,
  `        : {\n            kind: scenario.receiptKind,\n            ids: scenario.receiptIds ?? [scenario.receiptId as string],\n          },`,
  'registration test receipt expectation',
);
replaceOnce(
  testPath,
  `  it('rejects a mismatched type, action, resolution, or stale Submission version', async () => {`,
  `  it('rejects a Photos parent registration without one exact complete Media receipt set', async () => {\n    const scenario = scenarios[8];\n    if (scenario === undefined) throw new Error('Scenario is missing.');\n    for (const photoParentMediaDecisionIds of [undefined, [mediaDecisionIdA, mediaDecisionIdA]]) {\n      await expect(\n        registerSubmissionApplication(\n          context,\n          createBackend({ ...stateFor(scenario), photoParentMediaDecisionIds }),\n          submissionId,\n          requestFor(scenario.sourceDecisionKind),\n          registeredAt,\n        ),\n      ).rejects.toMatchObject({ code: 'ineligible' });\n    }\n  });\n\n  it('rejects a mismatched type, action, resolution, or stale Submission version', async () => {`,
  'registration test incomplete photo receipt',
);

const packagePath = 'package.json';
replaceOnce(
  packagePath,
  'node scripts/check-business-claim-field-provenance.mjs && tsx scripts/check-positive-payment-evidence.ts',
  'node scripts/check-business-claim-field-provenance.mjs && node scripts/check-p5-07f-photo-media-receipt-binding.mjs && tsx scripts/check-positive-payment-evidence.ts',
  'package P5-07F audit',
);

replaceOnce(
  'docs/P5_07E5_BUSINESS_CLAIM_FIELD_PROVENANCE.md',
  '**Status:** Active',
  '**Status:** Completed in #259',
  'E5 completion status',
);

const audit = `import { readFileSync } from 'node:fs';

const registration = readFileSync('src/admin/submissions/application-registration.ts', 'utf8');
const backend = readFileSync(
  'src/admin/submissions/drizzle-application-registration-backend.ts',
  'utf8',
);
const tests = readFileSync('tests/submission-application-registration.test.ts', 'utf8');
const status = readFileSync('docs/PROJECT_STATUS.md', 'utf8');
const documentation = readFileSync('docs/P5_07F_PHOTO_MEDIA_RECEIPT_BINDING.md', 'utf8');

for (const marker of [
  "request.sourceDecisionKind === 'photos_parent_resolution'",
  "applicationReceipt: { kind: 'media_review_decision', ids: decisionIds }",
  "publicationStatus: 'pending'",
  'photoParentMediaDecisionIds',
]) {
  if (!registration.includes(marker)) throw new Error(\`Registration marker missing: \${marker}\`);
}
for (const marker of [
  'parsePhotoParentResolutionEventPayload',
  'mediaReviewDecisions',
  "decision.expectedReviewStatus !== 'pending'",
  'Photos parent resolution does not match its durable Media receipt.',
]) {
  if (!backend.includes(marker)) throw new Error(\`Backend marker missing: \${marker}\`);
}
for (const marker of [
  "receiptKind: 'media_review_decision'",
  'photoParentMediaDecisionIds: [mediaDecisionIdB, mediaDecisionIdA]',
  'without one exact complete Media receipt set',
]) {
  if (!tests.includes(marker)) throw new Error(\`Test marker missing: \${marker}\`);
}
for (const marker of [
  'P5-07F — Photos Media receipt binding',
  'P5-07G',
]) {
  if (!status.includes(marker)) throw new Error(\`Status marker missing: \${marker}\`);
}
for (const marker of [
  'media_review_decision',
  'publication remains pending',
  'No Media, Submission, export, or release mutation',
]) {
  if (!documentation.includes(marker)) throw new Error(\`Documentation marker missing: \${marker}\`);
}
console.log('P5-07F Photos Media receipt binding checks passed.');
`;
writeFileSync('scripts/check-p5-07f-photo-media-receipt-binding.mjs', audit);

const documentation = `# P5-07F Photos Media receipt binding

**Implementation item:** P5-07F  
**Status:** Active  
**Last updated:** 2026-07-21

## Purpose

P5-07F reconciles the resolved Photos parent Submission with the durable Media review decisions that actually applied every child outcome.

The existing parent decision remains the source decision. The common application lifecycle no longer uses that parent Submission event as a substitute application receipt. Instead, an approved or partially approved Photos parent registers the complete exact child receipt set as:

\`\`\`text
kind: media_review_decision
ids: every decisionId from the parent event
\`\`\`

## Exact binding

Registration parses the exact private \`photo_parent_resolution_decided\` payload and requires:

- the payload request ID to equal the source decision event ID;
- the payload Submission ID and resolution to equal current canonical Submission state;
- unique child Media review decision IDs;
- every referenced \`media_review_decisions\` row to exist;
- exact Media Asset ID, action, initial pending status, resulting accepted/rejected status, and decision timestamp agreement.

Missing, duplicated, or mismatched child receipts make the registration ineligible or unavailable. The client cannot supply or reorder receipt IDs.

## Lifecycle result

For \`approved\` or \`partially_approved\` Photos parents:

\`\`\`text
applicationKind: photo_media_set
applicationStatus: committed
applicationReceipt: media_review_decision[]
publicationStatus: pending
publicationReceipt: null
\`\`\`

The source decision reference still points to the parent resolution event. This preserves both levels: the parent explains the aggregate outcome, while the application receipt identifies the exact canonical Media writes.

## Publication boundary

Publication remains pending. A later export release decision is the only valid publication receipt and release activation owner.

No Media, Submission, export, or release mutation is added by P5-07F. No new endpoint, table, migration, reviewer control, deployment, or retention behavior is introduced.

## Verification

\`\`\`text
node scripts/check-p5-07f-photo-media-receipt-binding.mjs
npx vitest run tests/submission-application-registration.test.ts
npm run check
\`\`\`

## Next

P5-07G executes bounded retention for contact, payload, Evidence, proof, and Media private material. Publication and export activation remain separate owners.
`;
writeFileSync('docs/P5_07F_PHOTO_MEDIA_RECEIPT_BINDING.md', documentation);

const statusPath = 'docs/PROJECT_STATUS.md';
let status = readFileSync(statusPath, 'utf8');
status = status.replace('P5-07E5 — Business Claim field provenance completion', 'P5-07F — Photos Media receipt binding');
status = status.replace(
  '- P5-07E5 is active in PR #259 on `p5-07e5-business-claim-field-provenance`.',
  `- P5-07E5 Business Claim field provenance completion completed in #259.\n- P5-07F is active in PR #${prNumber} on \`p5-07f-photo-media-receipt-binding\`.`,
);
status = status.replace('6e02124d7501216b1338b03fdb8726dfac1eac04', '10364840a1a8db472255dbf8e117c8e2c26185ca');
status = status.replace('The final P5-07E4 head passed all four normal workflow groups.', 'The final P5-07E5 head passed all four normal workflow groups.');
status = status.replace('#259 — P5-07E5 Business Claim field provenance completion', `#${prNumber} — P5-07F Photos Media receipt binding`);
const boundaryStart = status.indexOf('## Current boundary');
const blockedStart = status.indexOf('## Blocked');
if (boundaryStart < 0 || blockedStart <= boundaryStart) throw new Error('PROJECT_STATUS boundary markers are missing.');
const boundary = `## Current boundary

P5-07F keeps the private Photos parent resolution event as the source decision and binds the common application receipt to the complete exact child \`media_review_decision\` ID set.

Registration revalidates every referenced durable Media decision against the parent event. The application is \`committed\`, publication remains \`pending\`, and no export or release activation occurs.

## Next

P5-07G executes bounded retention for contact, payload, Evidence, proof, and Media private material. Publication and export activation remain separate later owners.

`;
status = status.slice(0, boundaryStart) + boundary + status.slice(blockedStart);
if (!status.includes('- `docs/P5_07F_PHOTO_MEDIA_RECEIPT_BINDING.md`')) {
  status = status.replace(
    '- `docs/P5_07E5_BUSINESS_CLAIM_FIELD_PROVENANCE.md`',
    '- `docs/P5_07E5_BUSINESS_CLAIM_FIELD_PROVENANCE.md`\n- `docs/P5_07F_PHOTO_MEDIA_RECEIPT_BINDING.md`',
  );
}
writeFileSync(statusPath, status);
