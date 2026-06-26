import { assetRegistry, findAssetCandidates } from '../src/registries/assets';
import { findNetworkCandidates, networkRegistry } from '../src/registries/networks';
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
import { networkRegistryEntrySchema } from '../src/schemas/network-registry';

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
  networkRegistryEntrySchema.safeParse(networkRegistry[0]),
  optionalDatabaseEnvironmentSchema.safeParse({}),
];

const failures = checks.filter((result) => !result.success);
const uniqueAssetSlugs = new Set(assetRegistry.map((asset) => asset.slug));
const uniqueNetworkSlugs = new Set(networkRegistry.map((network) => network.slug));

if (failures.length > 0) {
  const issues = failures.flatMap((failure) => (failure.success ? [] : failure.error.issues));
  throw new Error(`Runtime schema checks failed: ${JSON.stringify(issues)}`);
}

if (assetRegistry.length !== 10 || uniqueAssetSlugs.size !== assetRegistry.length) {
  throw new Error('Asset registry must contain ten unique initial canonical assets.');
}

if (networkRegistry.length !== 14 || uniqueNetworkSlugs.size !== networkRegistry.length) {
  throw new Error('Network registry must contain fourteen unique initial networks.');
}

if (findAssetCandidates('XBT')[0]?.slug !== 'bitcoin') {
  throw new Error('Asset alias resolution failed.');
}

const networkAliases = [
  ['LN', 'lightning'],
  ['Bitcoin mainnet', 'bitcoin'],
  ['TRC20', 'tron'],
  ['ERC20', 'ethereum'],
  ['BSC', 'bnb-smart-chain'],
] as const;

for (const [alias, expectedSlug] of networkAliases) {
  if (findNetworkCandidates(alias)[0]?.slug !== expectedSlug) {
    throw new Error(`Network alias resolution failed for ${alias}.`);
  }
}

console.log('Runtime schema checks passed.');
