import {
  evaluateEvidenceThreshold,
  evidenceInputSchema,
} from '../src/schemas/evidence';

const claimId = '11111111-1111-4111-8111-111111111111';
const acceptedOfficialPage = {
  claimId,
  submissionId: null,
  sourceRecordId: null,
  evidenceKind: 'official_payment_page',
  evidenceClass: 'a',
  sourceType: 'official_page',
  originRole: 'merchant_side',
  polarity: 'supporting',
  sourceName: 'Example merchant payments',
  sourceUrl: 'https://example.com/payments',
  sourceNativeId: null,
  observedAt: '2026-06-20T00:00:00Z',
  publishedAt: null,
  fetchedAt: '2026-06-20T00:05:00Z',
  summary: 'The official page describes the current cryptocurrency checkout flow.',
  visibility: 'public',
  reviewStatus: 'accepted',
  archiveUrl: null,
  contentHash: null,
  licenseId: null,
  attribution: null,
  independenceKey: 'example-merchant-official-site',
};

if (!evidenceInputSchema.safeParse(acceptedOfficialPage).success) {
  throw new Error('Valid accepted evidence was rejected.');
}

const invalidEvidence = [
  { ...acceptedOfficialPage, claimId: null },
  { ...acceptedOfficialPage, evidenceClass: 'b' },
  { ...acceptedOfficialPage, reviewStatus: 'pending', visibility: 'public' },
  { ...acceptedOfficialPage, observedAt: null },
  { ...acceptedOfficialPage, sourceUrl: 'https://example.com/payments', fetchedAt: null },
  { ...acceptedOfficialPage, archiveUrl: 'https://archive.example/item', sourceUrl: null },
];

if (invalidEvidence.some((item) => evidenceInputSchema.safeParse(item).success)) {
  throw new Error('Invalid evidence was accepted.');
}

const classAResult = evaluateEvidenceThreshold([
  {
    evidenceClass: 'a',
    originRole: 'merchant_side',
    polarity: 'supporting',
    reviewStatus: 'accepted',
    independenceKey: 'official-site',
    observedAt: '2026-06-20T00:00:00Z',
  },
]);

if (!classAResult.eligible || classAResult.basis !== 'single_a') {
  throw new Error('A single accepted Class A item must satisfy the evidence threshold.');
}

const classBPair = [
  {
    evidenceClass: 'b',
    originRole: 'merchant_side',
    polarity: 'supporting',
    reviewStatus: 'accepted',
    independenceKey: 'merchant-social',
    observedAt: '2026-06-20T00:00:00Z',
  },
  {
    evidenceClass: 'b',
    originRole: 'usage_side',
    polarity: 'supporting',
    reviewStatus: 'accepted',
    independenceKey: 'user-payment-report',
    observedAt: '2026-06-21T00:00:00Z',
  },
] as const;

const classBResult = evaluateEvidenceThreshold(classBPair);
if (!classBResult.eligible || classBResult.basis !== 'independent_b_pair') {
  throw new Error('Independent complementary Class B evidence must satisfy the threshold.');
}

const copiedPair = evaluateEvidenceThreshold([
  classBPair[0],
  { ...classBPair[1], independenceKey: classBPair[0].independenceKey },
]);
if (copiedPair.eligible) {
  throw new Error('Evidence with the same independence key must not count twice.');
}

const classCOnly = evaluateEvidenceThreshold([
  {
    evidenceClass: 'c',
    originRole: 'directory',
    polarity: 'supporting',
    reviewStatus: 'accepted',
    independenceKey: 'directory-entry',
    observedAt: '2026-06-21T00:00:00Z',
  },
]);
if (classCOnly.eligible) {
  throw new Error('Class C evidence must never satisfy the confirmation threshold.');
}

const contradicted = evaluateEvidenceThreshold([
  ...classBPair,
  {
    evidenceClass: 'a',
    originRole: 'usage_side',
    polarity: 'contradicting',
    reviewStatus: 'accepted',
    independenceKey: 'failed-checkout',
    observedAt: '2026-06-22T00:00:00Z',
  },
]);
if (contradicted.eligible) {
  throw new Error('Newer material contradiction must invalidate older supporting evidence.');
}

const restored = evaluateEvidenceThreshold([
  ...classBPair,
  {
    evidenceClass: 'a',
    originRole: 'usage_side',
    polarity: 'contradicting',
    reviewStatus: 'accepted',
    independenceKey: 'failed-checkout',
    observedAt: '2026-06-22T00:00:00Z',
  },
  {
    evidenceClass: 'a',
    originRole: 'on_ground',
    polarity: 'supporting',
    reviewStatus: 'accepted',
    independenceKey: 'reviewer-live-checkout',
    observedAt: '2026-06-23T00:00:00Z',
  },
]);
if (!restored.eligible || restored.basis !== 'single_a') {
  throw new Error('New supporting Class A evidence may restore eligibility after a contradiction.');
}

console.log('Evidence checks passed.');
