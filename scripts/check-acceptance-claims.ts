import {
  acceptanceClaimInputSchema,
  canTransitionAcceptanceClaim,
  claimRegionInputSchema,
} from '../src/schemas/acceptance-claims';

const confirmedClaim = {
  entityId: '11111111-1111-4111-8111-111111111111',
  locationId: '22222222-2222-4222-8222-222222222222',
  claimScope: 'location_specific',
  routeType: 'direct_wallet',
  acceptanceScope: 'all_checkout',
  claimStatus: 'confirmed',
  visibility: 'public',
  customerPaysCrypto: true,
  merchantExplicitlyAcceptsCrypto: true,
  processorId: null,
  howToPay: 'Ask staff to display the payment request.',
  instructionsLanguage: 'en',
  merchantReceives: 'not_publicly_confirmed',
  restrictions: null,
  firstConfirmedAt: '2026-06-01T00:00:00Z',
  lastConfirmedAt: '2026-06-27T00:00:00Z',
  nextReviewAt: '2026-12-24T00:00:00Z',
  endedAt: null,
  endedReason: null,
};

const checks = [
  acceptanceClaimInputSchema.safeParse(confirmedClaim),
  claimRegionInputSchema.safeParse({
    countryCode: 'JP',
    regionCode: 'tokyo',
    inclusionType: 'include',
    notes: null,
  }),
];

const failures = checks.filter((result) => !result.success);
if (failures.length > 0) {
  const issues = failures.flatMap((failure) => (failure.success ? [] : failure.error.issues));
  throw new Error(`Acceptance claim schema checks failed: ${JSON.stringify(issues)}`);
}

const invalidClaims = [
  { ...confirmedClaim, claimScope: 'brand_global', locationId: confirmedClaim.locationId },
  { ...confirmedClaim, routeType: 'processor_checkout', processorId: null },
  { ...confirmedClaim, claimStatus: 'ended', endedAt: null },
  { ...confirmedClaim, claimStatus: 'candidate', visibility: 'public' },
  { ...confirmedClaim, customerPaysCrypto: false },
];

if (invalidClaims.some((claim) => acceptanceClaimInputSchema.safeParse(claim).success)) {
  throw new Error('Acceptance claim constraints accepted an invalid claim.');
}

if (
  !canTransitionAcceptanceClaim('candidate', 'confirmed') ||
  !canTransitionAcceptanceClaim('confirmed', 'stale') ||
  !canTransitionAcceptanceClaim('stale', 'confirmed') ||
  !canTransitionAcceptanceClaim('confirmed', 'ended') ||
  canTransitionAcceptanceClaim('ended', 'confirmed') ||
  canTransitionAcceptanceClaim('rejected', 'candidate')
) {
  throw new Error('Acceptance claim transition rules are inconsistent.');
}

console.log('Acceptance claim checks passed.');
