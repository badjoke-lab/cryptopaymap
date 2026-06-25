import {
  acceptanceClaimStatusSchema,
  claimVisibilitySchema,
  foundationPlaceSchema,
  paymentMethodSchema,
  routeTypeSchema,
  submissionResolutionSchema,
  submissionWorkflowStatusSchema,
} from '../src/schemas/core';
import { optionalDatabaseEnvironmentSchema } from '../src/schemas/environment';

const samplePlace = {
  id: 'foundation-example-place',
  slug: 'example-coffee',
  name: 'Example Coffee',
  status: 'confirmed',
  asset: 'BTC',
  network: 'lightning',
  route: 'direct_wallet',
  lastConfirmed: '2026-06-01',
  howToPay: 'Ask staff to display a Lightning invoice and scan the QR code.',
};

const checks = [
  acceptanceClaimStatusSchema.safeParse('confirmed'),
  claimVisibilitySchema.safeParse('public'),
  routeTypeSchema.safeParse('direct_wallet'),
  paymentMethodSchema.safeParse('lightning_invoice'),
  submissionWorkflowStatusSchema.safeParse('in_review'),
  submissionResolutionSchema.safeParse('approved'),
  foundationPlaceSchema.safeParse(samplePlace),
  optionalDatabaseEnvironmentSchema.safeParse({}),
];

const failures = checks.filter((result) => !result.success);

if (failures.length > 0) {
  const issues = failures.flatMap((failure) =>
    failure.success ? [] : failure.error.issues,
  );

  throw new Error(`Runtime schema checks failed: ${JSON.stringify(issues)}`);
}

console.log('Runtime schema checks passed.');
