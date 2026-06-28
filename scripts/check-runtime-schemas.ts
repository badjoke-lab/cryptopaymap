import './check-acceptance-claims';
import './check-candidate-plan-persistence';
import './check-canonical-identity';
import './check-claim-assets';
import './check-evidence';
import './check-media-legacy';
import './check-online-service-importer';
import './check-phase-2-integration';
import './check-physical-place-importer';
import './check-source-provenance';
import './check-verification-events';
import { assetRegistry, findAssetCandidates } from '../src/registries/assets';
import { findNetworkCandidates, networkRegistry } from '../src/registries/networks';
import {
  findPaymentMethodCandidates,
  findPaymentRouteCandidates,
  paymentMethodRegistry,
  paymentRouteRegistry,
} from '../src/registries/payment';
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
import {
  paymentMethodRecordSchema,
  paymentRouteRecordSchema,
} from '../src/schemas/payment-registry-records';

// Side-effect imports enforce each completed data boundary before shared registry checks run.
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
  paymentRouteRecordSchema.safeParse(paymentRouteRegistry[0]),
  paymentMethodRecordSchema.safeParse(paymentMethodRegistry[0]),
  optionalDatabaseEnvironmentSchema.safeParse({}),
];

const failures = checks.filter((result) => !result.success);
const uniqueAssetSlugs = new Set(assetRegistry.map((asset) => asset.slug));
const uniqueNetworkSlugs = new Set(networkRegistry.map((network) => network.slug));
const uniqueRouteSlugs = new Set(paymentRouteRegistry.map((route) => route.slug));
const uniqueMethodSlugs = new Set(paymentMethodRegistry.map((method) => method.slug));

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

if (paymentRouteRegistry.length !== 2 || uniqueRouteSlugs.size !== paymentRouteRegistry.length) {
  throw new Error('Payment route registry must contain two unique routes.');
}

if (paymentMethodRegistry.length !== 8 || uniqueMethodSlugs.size !== paymentMethodRegistry.length) {
  throw new Error('Payment method registry must contain eight unique methods.');
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

const methodAliases = [
  ['LN invoice', 'lightning_invoice'],
  ['wallet QR code', 'wallet_qr'],
  ['crypto POS', 'pos_terminal'],
  ['pay link', 'payment_link'],
] as const;

for (const [alias, expectedSlug] of methodAliases) {
  if (findPaymentMethodCandidates(alias)[0]?.slug !== expectedSlug) {
    throw new Error(`Payment method alias resolution failed for ${alias}.`);
  }
}

if (findPaymentRouteCandidates('Direct wallet')[0]?.slug !== 'direct_wallet') {
  throw new Error('Payment route lookup failed.');
}

const methodSlugs = new Set<string>(paymentMethodRegistry.map((method) => method.slug));
if (methodSlugs.has('direct_wallet')) {
  throw new Error('Payment methods must not contain route identifiers.');
}

console.log('Runtime schema checks passed.');
