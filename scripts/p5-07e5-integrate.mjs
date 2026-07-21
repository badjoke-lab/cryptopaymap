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

const servicePath = 'src/admin/submissions/business-claim-field-provenance.ts';
replaceOnce(
  servicePath,
  `  businessClaimFieldProvenanceEventPayloadSchema,\n  businessClaimFieldProvenanceReceiptSchema,`,
  `  businessClaimFieldProvenanceReceiptSchema,`,
  'service unused schema import',
);
replaceOnce(
  servicePath,
  `  targetType: 'entity' | 'location';\n  targetId: string;\n  targetUpdatedAt: string;\n  fieldAppliedAt: string;`,
  `  targetType: 'entity' | 'location';\n  targetId: string;\n  fieldAppliedAt: string;`,
  'service unused target version',
);
replaceOnce(
  servicePath,
  `  const fields = [...application.acceptedFields]\n    .sort((left, right) => left.localeCompare(right))\n    .map((fieldPath) => ({\n      fieldPath,\n      beforeValue: application.before[fieldPath],\n      appliedValue: application.after[fieldPath],\n    }));`,
  `  const beforeValues = application.before as unknown as Record<string, unknown>;\n  const afterValues = application.after as unknown as Record<string, unknown>;\n  const fields = [...application.acceptedFields]\n    .sort((left, right) => left.localeCompare(right))\n    .map((fieldPath) => ({\n      fieldPath,\n      beforeValue: beforeValues[fieldPath],\n      appliedValue: afterValues[fieldPath],\n    }));`,
  'service canonical value indexing',
);
replaceOnce(
  servicePath,
  `    targetType,\n    targetId: payload.projection.targetId,\n    targetUpdatedAt: state.target.updatedAt,\n    fieldAppliedAt: payload.appliedAt,`,
  `    targetType,\n    targetId: payload.projection.targetId,\n    fieldAppliedAt: payload.appliedAt,`,
  'service target version return',
);
const service = readFileSync(servicePath, 'utf8');
const eventPayloadBlock = /\n  const eventPayload = businessClaimFieldProvenanceEventPayloadSchema\.parse\(\{[\s\S]*?\n  \}\);\n\n  let commitReceipt:/;
if (eventPayloadBlock.test(service)) {
  writeFileSync(servicePath, service.replace(eventPayloadBlock, '\n\n  let commitReceipt:'));
}

const backendPath = 'src/admin/submissions/drizzle-business-claim-field-provenance-backend.ts';
replaceOnce(
  backendPath,
  `      const targetGuard =\n        command.targetType === 'entity'`,
  `      const fieldPathGuard = inArray(provenanceLinks.fieldPath, command.fieldPaths);\n      const targetGuard =\n        command.targetType === 'entity'`,
  'backend field path guard',
);
let backend = readFileSync(backendPath, 'utf8');
backend = backend.replaceAll(
  `and \${provenanceLinks.fieldPath} in \${command.fieldPaths}`,
  `and \${fieldPathGuard}`,
);
backend = backend.replace(
  `(completion.internal_note::jsonb ->> 'fieldApplicationEventId')`,
  `(coalesce(completion.internal_note, '{}')::jsonb ->> 'fieldApplicationEventId')`,
);
writeFileSync(backendPath, backend);

const packagePath = 'package.json';
replaceOnce(
  packagePath,
  'node scripts/check-business-claim-payment-application.mjs && tsx scripts/check-positive-payment-evidence.ts',
  'node scripts/check-business-claim-payment-application.mjs && node scripts/check-business-claim-field-provenance.mjs && tsx scripts/check-positive-payment-evidence.ts',
  'package schema check',
);

replaceOnce(
  'docs/P5_07E4_BUSINESS_CLAIM_PAYMENT_APPLICATION.md',
  '**Status:** Active',
  '**Status:** Completed in #258',
  'E4 completion status',
);

const statusPath = 'docs/PROJECT_STATUS.md';
let status = readFileSync(statusPath, 'utf8');
status = status.replace('**Last verified:** 2026-07-20', '**Last verified:** 2026-07-21');
status = status.replace(
  'P5-07E4 — Atomic Business Claim payment application',
  'P5-07E5 — Business Claim field provenance completion',
);
status = status.replace(
  '- P5-07E4 is active in PR #258 on `p5-07e4-business-claim-payment-application`.',
  `- P5-07E4 atomic Business Claim payment application completed in #258.\n- P5-07E5 is active in PR #${prNumber} on \`p5-07e5-business-claim-field-provenance\`.`,
);
status = status.replace(
  '2cc89ee3db694c768d083ba67de12a056ec8926b',
  '6e02124d7501216b1338b03fdb8726dfac1eac04',
);
status = status.replace(
  'The final P5-07E3 head passed all four normal workflow groups.',
  'The final P5-07E4 head passed all four normal workflow groups.',
);
status = status.replace(
  '#258 — P5-07E4 atomic Business Claim payment application',
  `#${prNumber} — P5-07E5 Business Claim field provenance completion`,
);
const boundaryStart = status.indexOf('## Current boundary');
const blockedStart = status.indexOf('## Blocked');
if (boundaryStart < 0 || blockedStart <= boundaryStart) {
  throw new Error('PROJECT_STATUS boundary markers are missing.');
}
const boundary = `## Current boundary

P5-07E5 consumes one exact private P5-04H2 \`business_claim_fields_applied\` event and completes the missing Entity or Location field-level provenance. It does not update the canonical target again.

The operation verifies the current exact target version and every accepted H2 field value, writes one deterministic private Business Claim Source Record, closes the exact prior open non-correction field links at the H2 application time, inserts current \`correction\` links, and records one private completion event in the same transaction.

## Next

P5-07F reconciles Photos parent resolution, Media application receipts, and publication handoff. Export activation remains a separate later owner.

`;
status = status.slice(0, boundaryStart) + boundary + status.slice(blockedStart);
if (!status.includes('- `docs/P5_07E5_BUSINESS_CLAIM_FIELD_PROVENANCE.md`')) {
  status = status.replace(
    '- `docs/P5_07E4_BUSINESS_CLAIM_PAYMENT_APPLICATION.md`',
    '- `docs/P5_07E4_BUSINESS_CLAIM_PAYMENT_APPLICATION.md`\n- `docs/P5_07E5_BUSINESS_CLAIM_FIELD_PROVENANCE.md`',
  );
}
writeFileSync(statusPath, status);
