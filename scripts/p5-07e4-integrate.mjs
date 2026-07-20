import { readFileSync, writeFileSync } from 'node:fs';

const prNumber = process.env.PR_NUMBER;
if (typeof prNumber !== 'string' || !/^\d+$/.test(prNumber)) {
  throw new Error('PR_NUMBER is required.');
}

const packagePath = 'package.json';
let packageText = readFileSync(packagePath, 'utf8');
const packageMarker =
  'node scripts/check-business-claim-payment-plan.mjs && tsx scripts/check-positive-payment-evidence.ts';
const packageReplacement =
  'node scripts/check-business-claim-payment-plan.mjs && node scripts/check-business-claim-payment-application.mjs && tsx scripts/check-positive-payment-evidence.ts';
if (!packageText.includes(packageReplacement)) {
  if (!packageText.includes(packageMarker)) throw new Error('package schema:check marker is missing.');
  packageText = packageText.replace(packageMarker, packageReplacement);
  writeFileSync(packagePath, packageText);
}

const e3Path = 'docs/P5_07E3_BUSINESS_CLAIM_PAYMENT_PLAN.md';
let e3 = readFileSync(e3Path, 'utf8');
e3 = e3.replace('**Status:** Active', '**Status:** Completed in #257');
writeFileSync(e3Path, e3);

const statusPath = 'docs/PROJECT_STATUS.md';
let status = readFileSync(statusPath, 'utf8');
status = status.replace(
  'P5-07E3 — Durable Business Claim payment application plan',
  'P5-07E4 — Atomic Business Claim payment application',
);
status = status.replace(
  '- P5-07E3 is active in PR #257 on `p5-07e3-business-claim-payment-plan`.',
  `- P5-07E3 durable Business Claim payment application plan completed in #257.\n- P5-07E4 is active in PR #${prNumber} on \`p5-07e4-business-claim-payment-application\`.`,
);
status = status.replace(
  '60d0881778aaf04e1cdd1d408d60be609cc7bd77',
  '2cc89ee3db694c768d083ba67de12a056ec8926b',
);
status = status.replace(
  'The final P5-07E2 head passed all four normal workflow groups.',
  'The final P5-07E3 head passed all four normal workflow groups.',
);
status = status.replace(
  '#257 — P5-07E3 durable Business Claim payment plan',
  `#${prNumber} — P5-07E4 atomic Business Claim payment application`,
);
const boundaryStart = status.indexOf('## Current boundary');
const blockedStart = status.indexOf('## Blocked');
if (boundaryStart < 0 || blockedStart <= boundaryStart) {
  throw new Error('PROJECT_STATUS boundary markers are missing.');
}
const boundary = `## Current boundary

P5-07E4 may consume only one exact private P5-07E3 plan. It atomically creates planned hidden candidate Claims, inserts planned Claim Asset rows, preserves already-present rows, writes one private Source Record, payment provenance, Verification Events, and one canonical Submission event.

Entity and Location profile fields are not changed. Application lifecycle commit follows the canonical transaction and supports exact replay-safe recovery without a second canonical write.

## Next

Complete Entity and Location field-level provenance for H2-applied Business Claim field changes. Publication, export, and retention remain separate later owners.

`;
status = status.slice(0, boundaryStart) + boundary + status.slice(blockedStart);
if (!status.includes('- `docs/P5_07E4_BUSINESS_CLAIM_PAYMENT_APPLICATION.md`')) {
  status = status.replace(
    '- `docs/P5_07E3_BUSINESS_CLAIM_PAYMENT_PLAN.md`',
    '- `docs/P5_07E3_BUSINESS_CLAIM_PAYMENT_PLAN.md`\n- `docs/P5_07E4_BUSINESS_CLAIM_PAYMENT_APPLICATION.md`',
  );
}
writeFileSync(statusPath, status);
