import { assetRegistry, findAssetCandidates } from '../src/registries/assets';
import { assetRegistryEntrySchema } from '../src/schemas/assets';
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
  assetRegistryEntrySchema.safeParse(assetRegistry[0]),
  optionalDatabaseEnvironmentSchema.safeParse({}),
];

const failures = checks.filter((result) => !result.success);
const uniqueSlugs = new Set(assetRegistry.map((asset) => asset.slug));

if (failures.length > 0) {
  const issues = failures.flatMap((failure) => (failure.success ? [] : failure.error.issues));
  throw new Error(`Runtime schema checks failed: ${JSON.stringify(issues)}`);
}

if (assetRegistry.length !== 10 || uniqueSlugs.size !== assetRegistry.length) {
  throw new Error('Asset registry must contain ten unique initial canonical assets.');
}

if (findAssetCandidates('XBT')[0]?.slug !== 'bitcoin') {
  throw new Error('Asset alias resolution failed.');
}

console.log('Runtime schema checks passed.');
