import {
  claimAssetPublicationContextSchema,
  claimAssetSetSchema,
  normalizeContractAddress,
} from '../src/schemas/claim-assets';

const claimId = '11111111-1111-4111-8111-111111111111';
const bitcoinId = '22222222-2222-4222-8222-222222222222';
const networkId = '33333333-3333-4333-8333-333333333333';
const onchainId = '44444444-4444-4444-8444-444444444444';
const lightningId = '55555555-5555-4555-8555-555555555555';
const lightningMethodId = '66666666-6666-4666-8666-666666666666';

const claimAssetSet = [
  {
    claimId,
    assetId: bitcoinId,
    networkId,
    paymentMethodId: onchainId,
    contractAddress: null,
    isPrimary: true,
    notes: null,
  },
  {
    claimId,
    assetId: bitcoinId,
    networkId: lightningId,
    paymentMethodId: lightningMethodId,
    contractAddress: null,
    isPrimary: false,
    notes: 'Lightning invoice is available at checkout.',
  },
];

const validContexts = [
  {
    routeType: 'direct_wallet',
    networkSlug: 'bitcoin',
    paymentMethodSlug: 'onchain',
    assetStatus: 'active',
    networkStatus: 'active',
    paymentMethodStatus: 'active',
  },
  {
    routeType: 'direct_wallet',
    networkSlug: 'lightning',
    paymentMethodSlug: 'lightning_invoice',
    assetStatus: 'active',
    networkStatus: 'active',
    paymentMethodStatus: 'active',
  },
  {
    routeType: 'processor_checkout',
    networkSlug: 'ethereum',
    paymentMethodSlug: 'processor_checkout',
    assetStatus: 'active',
    networkStatus: 'active',
    paymentMethodStatus: 'active',
  },
];

if (!claimAssetSetSchema.safeParse(claimAssetSet).success) {
  throw new Error('Valid claim asset set was rejected.');
}

if (validContexts.some((context) => !claimAssetPublicationContextSchema.safeParse(context).success)) {
  throw new Error('Valid claim asset publication context was rejected.');
}

const invalidSets = [
  claimAssetSet.map((row) => ({ ...row, isPrimary: false })),
  [claimAssetSet[0], { ...claimAssetSet[0] }],
];

if (invalidSets.some((rows) => claimAssetSetSchema.safeParse(rows).success)) {
  throw new Error('Invalid claim asset set was accepted.');
}

const invalidContexts = [
  { ...validContexts[0], networkSlug: 'bitcoin', paymentMethodSlug: 'lightning_invoice' },
  { ...validContexts[0], networkSlug: 'lightning', paymentMethodSlug: 'onchain' },
  { ...validContexts[0], paymentMethodSlug: 'processor_checkout' },
  { ...validContexts[0], networkStatus: 'deprecated' },
];

if (
  invalidContexts.some((context) => claimAssetPublicationContextSchema.safeParse(context).success)
) {
  throw new Error('Invalid claim asset publication context was accepted.');
}

if (
  normalizeContractAddress('  0xAbC123  ') !== '0xAbC123' ||
  normalizeContractAddress('   ') !== null ||
  normalizeContractAddress(null) !== null
) {
  throw new Error('Contract address normalization failed.');
}

console.log('Claim asset checks passed.');
