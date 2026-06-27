import {
  legacyPlaceIdInputSchema,
  mediaAssetInputSchema,
  mediaFileInputSchema,
  mediaPublicationInputSchema,
} from '../src/schemas/media-legacy';

const entityId = '11111111-1111-4111-8111-111111111111';
const locationId = '22222222-2222-4222-8222-222222222222';
const evidenceId = '33333333-3333-4333-8333-333333333333';
const licenseId = '44444444-4444-4444-8444-444444444444';
const sourceRecordId = '55555555-5555-4555-8555-555555555555';

const galleryAsset = {
  purpose: 'public_gallery',
  role: 'cover',
  reviewStatus: 'accepted',
  rightsStatus: 'licensed',
  visibility: 'public',
  entityId: null,
  locationId,
  claimId: null,
  evidenceId: null,
  submissionId: null,
  sourceRecordId: null,
  licenseId,
  attribution: 'Photo © Example Photographer, CC BY 4.0',
  altText: 'Exterior of Example Coffee with its entrance visible.',
  rightsHolder: 'Example Photographer',
  consentReference: null,
  displayOrder: 0,
  capturedAt: '2026-06-20T00:00:00Z',
  publishedAt: '2026-06-21T00:00:00Z',
  deletedAt: null,
};

const evidenceAsset = {
  ...galleryAsset,
  purpose: 'evidence',
  role: 'evidence_image',
  visibility: 'private',
  entityId: null,
  locationId: null,
  evidenceId,
  publishedAt: null,
  altText: null,
};

const originalFile = {
  variant: 'original',
  storageScope: 'private',
  storageKey: 'media/private/asset-1/original.heic',
  originalFilename: 'storefront.heic',
  mimeType: 'image/heic',
  byteSize: 2_000_000,
  width: 2_400,
  height: 1_600,
  contentHash: 'a'.repeat(64),
};

const displayFile = {
  variant: 'display',
  storageScope: 'public',
  storageKey: 'media/public/asset-1/display.webp',
  originalFilename: null,
  mimeType: 'image/webp',
  byteSize: 320_000,
  width: 1_200,
  height: 800,
  contentHash: 'b'.repeat(64),
};

const publication = {
  asset: galleryAsset,
  files: [originalFile, displayFile],
  licenseAttributionRequired: true,
};

const physicalLegacyId = {
  sourceSystem: 'cryptopaymap_v2',
  legacyId: 'place-123',
  legacyPath: '/place/place-123',
  migrationStatus: 'mapped',
  canonicalPath: '/places/example-coffee',
  entityId: null,
  locationId,
  sourceRecordId,
  resolutionNote: 'Mapped to the reviewed canonical location.',
  resolvedAt: '2026-06-21T00:00:00Z',
};

const onlineLegacyId = {
  sourceSystem: 'crypto_acceptance_registry',
  legacyId: 'service-456',
  legacyPath: '/online/service-456',
  migrationStatus: 'mapped',
  canonicalPath: '/service/example-service',
  entityId,
  locationId: null,
  sourceRecordId,
  resolutionNote: 'Mapped to the reviewed online-service entity.',
  resolvedAt: '2026-06-21T00:00:00Z',
};

const pendingLegacyId = {
  ...physicalLegacyId,
  legacyId: 'place-pending',
  legacyPath: '/place/place-pending',
  migrationStatus: 'pending',
  canonicalPath: null,
  locationId: null,
  resolutionNote: null,
  resolvedAt: null,
};

const unresolvedLegacyId = {
  ...physicalLegacyId,
  legacyId: 'place-missing',
  legacyPath: '/place/place-missing',
  migrationStatus: 'unresolved',
  canonicalPath: null,
  locationId: null,
  resolutionNote: 'No canonical record can be identified from the legacy data.',
  resolvedAt: '2026-06-21T00:00:00Z',
};

const checks = [
  mediaAssetInputSchema.safeParse(galleryAsset),
  mediaAssetInputSchema.safeParse(evidenceAsset),
  mediaFileInputSchema.safeParse(originalFile),
  mediaFileInputSchema.safeParse(displayFile),
  mediaPublicationInputSchema.safeParse(publication),
  legacyPlaceIdInputSchema.safeParse(physicalLegacyId),
  legacyPlaceIdInputSchema.safeParse(onlineLegacyId),
  legacyPlaceIdInputSchema.safeParse(pendingLegacyId),
  legacyPlaceIdInputSchema.safeParse(unresolvedLegacyId),
];

const failures = checks.filter((result) => !result.success);
if (failures.length > 0) {
  const issues = failures.flatMap((failure) => (failure.success ? [] : failure.error.issues));
  throw new Error(`Media and legacy checks failed: ${JSON.stringify(issues)}`);
}

const invalidAssets = [
  { ...galleryAsset, entityId },
  { ...galleryAsset, role: 'evidence_image' },
  { ...galleryAsset, reviewStatus: 'pending' },
  { ...galleryAsset, rightsStatus: 'restricted', licenseId: null },
  { ...galleryAsset, rightsStatus: 'licensed', licenseId: null },
  {
    ...galleryAsset,
    rightsStatus: 'submitted_with_permission',
    licenseId: null,
    rightsHolder: null,
    consentReference: null,
  },
  { ...galleryAsset, purpose: 'public_gallery_candidate' },
  { ...galleryAsset, publishedAt: null },
  { ...galleryAsset, altText: null },
  { ...galleryAsset, deletedAt: '2026-06-22T00:00:00Z' },
  {
    ...galleryAsset,
    capturedAt: '2026-06-22T00:00:00Z',
    publishedAt: '2026-06-21T00:00:00Z',
  },
];

if (invalidAssets.some((asset) => mediaAssetInputSchema.safeParse(asset).success)) {
  throw new Error('Invalid media asset was accepted.');
}

const invalidFiles = [
  { ...originalFile, storageScope: 'public' },
  { ...displayFile, mimeType: 'image/heic' },
  { ...displayFile, mimeType: 'image/png' },
  { ...displayFile, originalFilename: 'derived.webp' },
  { ...displayFile, width: null },
  { ...displayFile, storageKey: '../public/display.webp' },
  { ...displayFile, contentHash: 'A'.repeat(64) },
];

if (invalidFiles.some((file) => mediaFileInputSchema.safeParse(file).success)) {
  throw new Error('Invalid media file was accepted.');
}

const invalidPublications = [
  {
    ...publication,
    asset: { ...galleryAsset, visibility: 'private', publishedAt: null },
  },
  {
    ...publication,
    asset: { ...galleryAsset, attribution: null },
  },
  {
    ...publication,
    files: [displayFile, { ...displayFile, storageKey: 'media/public/asset-1/display-2.webp' }],
  },
  {
    ...publication,
    files: [originalFile],
  },
];

if (invalidPublications.some((value) => mediaPublicationInputSchema.safeParse(value).success)) {
  throw new Error('Invalid media publication was accepted.');
}

const invalidLegacyIds = [
  { ...physicalLegacyId, locationId: null },
  { ...physicalLegacyId, entityId },
  { ...physicalLegacyId, sourceSystem: 'crypto_acceptance_registry' },
  { ...onlineLegacyId, sourceSystem: 'cryptopaymap_v2' },
  { ...pendingLegacyId, resolvedAt: '2026-06-21T00:00:00Z' },
  { ...unresolvedLegacyId, resolutionNote: null },
  { ...unresolvedLegacyId, locationId },
  { ...physicalLegacyId, legacyPath: '/place/123?from=old' },
  { ...physicalLegacyId, canonicalPath: '/' },
  { ...physicalLegacyId, canonicalPath: physicalLegacyId.legacyPath },
];

if (invalidLegacyIds.some((legacy) => legacyPlaceIdInputSchema.safeParse(legacy).success)) {
  throw new Error('Invalid legacy identifier was accepted.');
}

console.log('Media and legacy checks passed.');
