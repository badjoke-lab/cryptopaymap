import { z } from 'zod';
import {
  legacyMigrationStatusValues,
  legacySourceSystemValues,
  mediaPurposeValues,
  mediaReviewStatusValues,
  mediaRightsStatusValues,
  mediaRoleValues,
  mediaStorageScopeValues,
  mediaVariantValues,
  mediaVisibilityValues,
} from '../db/schema';

export const mediaPurposeSchema = z.enum(mediaPurposeValues);
export const mediaRoleSchema = z.enum(mediaRoleValues);
export const mediaReviewStatusSchema = z.enum(mediaReviewStatusValues);
export const mediaRightsStatusSchema = z.enum(mediaRightsStatusValues);
export const mediaVisibilitySchema = z.enum(mediaVisibilityValues);
export const mediaVariantSchema = z.enum(mediaVariantValues);
export const mediaStorageScopeSchema = z.enum(mediaStorageScopeValues);
export const legacySourceSystemSchema = z.enum(legacySourceSystemValues);
export const legacyMigrationStatusSchema = z.enum(legacyMigrationStatusValues);

const nullableUuidSchema = z.uuid().nullable();
const nullableTimestampSchema = z.iso.datetime({ offset: true }).nullable();
const publicPurposes = new Set<(typeof mediaPurposeValues)[number]>([
  'public_gallery',
  'canonical_logo',
]);
const publishableRights = new Set<(typeof mediaRightsStatusValues)[number]>([
  'submitted_with_permission',
  'licensed',
  'public_domain',
]);
const galleryRoles = new Set<(typeof mediaRoleValues)[number]>([
  'cover',
  'gallery',
  'exterior',
  'interior',
  'product',
  'menu',
  'payment_sign',
  'checkout_terminal',
]);
const acceptedImageMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
] as const;
const derivedImageMimeTypes = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);
const publicImageMimeTypes = new Set<string>(['image/jpeg', 'image/webp']);

export const mediaAssetInputSchema = z
  .object({
    purpose: mediaPurposeSchema,
    role: mediaRoleSchema,
    reviewStatus: mediaReviewStatusSchema,
    rightsStatus: mediaRightsStatusSchema,
    visibility: mediaVisibilitySchema,
    entityId: nullableUuidSchema,
    locationId: nullableUuidSchema,
    claimId: nullableUuidSchema,
    evidenceId: nullableUuidSchema,
    submissionId: nullableUuidSchema,
    sourceRecordId: nullableUuidSchema,
    licenseId: nullableUuidSchema,
    attribution: z.string().trim().min(1).max(1_000).nullable(),
    altText: z.string().trim().min(1).max(500).nullable(),
    rightsHolder: z.string().trim().min(1).max(200).nullable(),
    consentReference: z.string().trim().min(1).max(256).nullable(),
    displayOrder: z.number().int().min(0),
    capturedAt: nullableTimestampSchema,
    publishedAt: nullableTimestampSchema,
    deletedAt: nullableTimestampSchema,
  })
  .superRefine((asset, context) => {
    const subjects = [
      asset.entityId,
      asset.locationId,
      asset.claimId,
      asset.evidenceId,
      asset.submissionId,
      asset.sourceRecordId,
    ].filter((value) => value !== null);

    if (subjects.length !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['entityId'],
        message: 'A media asset must target exactly one canonical or private subject.',
      });
    }

    const purposeRoleValid =
      (asset.purpose === 'evidence' && asset.role === 'evidence_image') ||
      (asset.purpose === 'owner_verification' && asset.role === 'owner_verification_proof') ||
      (asset.purpose === 'canonical_logo' && asset.role === 'logo') ||
      (['public_gallery_candidate', 'public_gallery'].includes(asset.purpose) &&
        galleryRoles.has(asset.role));

    if (!purposeRoleValid) {
      context.addIssue({
        code: 'custom',
        path: ['role'],
        message: 'The media role is not valid for this purpose.',
      });
    }

    if (asset.rightsStatus === 'licensed' && asset.licenseId === null) {
      context.addIssue({
        code: 'custom',
        path: ['licenseId'],
        message: 'Licensed media requires a license record.',
      });
    }

    if (
      asset.rightsStatus === 'submitted_with_permission' &&
      asset.rightsHolder === null &&
      asset.consentReference === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['consentReference'],
        message: 'Submitted media requires a rights holder or consent reference.',
      });
    }

    if (asset.visibility === 'public') {
      if (asset.reviewStatus !== 'accepted') {
        context.addIssue({
          code: 'custom',
          path: ['reviewStatus'],
          message: 'Public media must be accepted.',
        });
      }
      if (!publicPurposes.has(asset.purpose)) {
        context.addIssue({
          code: 'custom',
          path: ['purpose'],
          message: 'Evidence, owner-verification, and gallery-candidate media cannot be public.',
        });
      }
      if (!publishableRights.has(asset.rightsStatus)) {
        context.addIssue({
          code: 'custom',
          path: ['rightsStatus'],
          message: 'The media rights do not permit public distribution.',
        });
      }
      if (asset.publishedAt === null) {
        context.addIssue({
          code: 'custom',
          path: ['publishedAt'],
          message: 'Public media requires a publication time.',
        });
      }
      if (asset.altText === null) {
        context.addIssue({
          code: 'custom',
          path: ['altText'],
          message: 'Public media requires alt text.',
        });
      }
      if (asset.deletedAt !== null) {
        context.addIssue({
          code: 'custom',
          path: ['deletedAt'],
          message: 'Deleted media cannot remain public.',
        });
      }
    }

    if (
      asset.capturedAt !== null &&
      asset.publishedAt !== null &&
      Date.parse(asset.capturedAt) > Date.parse(asset.publishedAt)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['publishedAt'],
        message: 'Publication time cannot precede capture time.',
      });
    }
  });

export const mediaFileInputSchema = z
  .object({
    variant: mediaVariantSchema,
    storageScope: mediaStorageScopeSchema,
    storageKey: z
      .string()
      .trim()
      .min(1)
      .max(1_024)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'Use a relative object-storage key.')
      .refine(
        (value) => !value.split('/').includes('..'),
        'Storage keys cannot traverse directories.',
      ),
    originalFilename: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .refine((value) => !/[\\/]/.test(value), 'Original filenames cannot include a path.')
      .nullable(),
    mimeType: z.enum(acceptedImageMimeTypes),
    byteSize: z.number().int().positive(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    contentHash: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{64}$/, 'Use a lowercase SHA-256 content hash.'),
  })
  .superRefine((file, context) => {
    if ((file.width === null) !== (file.height === null)) {
      context.addIssue({
        code: 'custom',
        path: ['width'],
        message: 'Image width and height must either both be present or both be absent.',
      });
    }

    if (file.originalFilename !== null && file.variant !== 'original') {
      context.addIssue({
        code: 'custom',
        path: ['originalFilename'],
        message: 'Only original files may retain the submitted filename.',
      });
    }

    if (file.variant === 'original' && file.storageScope === 'public') {
      context.addIssue({
        code: 'custom',
        path: ['storageScope'],
        message: 'Original uploads cannot be public.',
      });
    }

    if (file.variant !== 'original' && !derivedImageMimeTypes.has(file.mimeType)) {
      context.addIssue({
        code: 'custom',
        path: ['mimeType'],
        message: 'HEIC and HEIF are accepted only as original uploads.',
      });
    }

    if (file.storageScope === 'public' && !publicImageMimeTypes.has(file.mimeType)) {
      context.addIssue({
        code: 'custom',
        path: ['mimeType'],
        message: 'Public derivatives must use JPEG or WebP.',
      });
    }
  });

export const mediaPublicationInputSchema = z
  .object({
    asset: mediaAssetInputSchema,
    files: z.array(mediaFileInputSchema).min(1),
    licenseAttributionRequired: z.boolean().nullable(),
  })
  .superRefine((publication, context) => {
    const variants = new Set<(typeof mediaVariantValues)[number]>();

    for (const [index, file] of publication.files.entries()) {
      if (variants.has(file.variant)) {
        context.addIssue({
          code: 'custom',
          path: ['files', index, 'variant'],
          message: 'A media asset can contain only one file per variant.',
        });
      }
      variants.add(file.variant);

      if (file.storageScope === 'public' && publication.asset.visibility !== 'public') {
        context.addIssue({
          code: 'custom',
          path: ['files', index, 'storageScope'],
          message: 'A public file requires a public media asset.',
        });
      }
    }

    if (
      publication.asset.rightsStatus === 'licensed' &&
      publication.licenseAttributionRequired === true &&
      publication.asset.attribution === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['asset', 'attribution'],
        message: 'This license requires attribution before publication.',
      });
    }

    if (
      publication.asset.visibility === 'public' &&
      !publication.files.some(
        (file) => file.storageScope === 'public' && file.variant !== 'original',
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['files'],
        message: 'A public media asset requires a public display or thumbnail derivative.',
      });
    }
  });

export const legacyPlaceIdInputSchema = z
  .object({
    sourceSystem: legacySourceSystemSchema,
    legacyId: z.string().trim().min(1).max(256),
    legacyPath: z
      .string()
      .trim()
      .regex(/^\/[^?#]*$/, 'Use a path without a query or fragment.')
      .nullable(),
    migrationStatus: legacyMigrationStatusSchema,
    canonicalPath: z
      .string()
      .trim()
      .regex(/^\/[^?#]+$/, 'Use a non-root canonical path without a query or fragment.')
      .nullable(),
    entityId: nullableUuidSchema,
    locationId: nullableUuidSchema,
    sourceRecordId: nullableUuidSchema,
    resolutionNote: z.string().trim().min(1).max(2_000).nullable(),
    resolvedAt: nullableTimestampSchema,
  })
  .superRefine((legacy, context) => {
    const targetCount = [legacy.entityId, legacy.locationId].filter(
      (value) => value !== null,
    ).length;

    if (legacy.migrationStatus === 'pending') {
      if (legacy.resolvedAt !== null || legacy.canonicalPath !== null || targetCount !== 0) {
        context.addIssue({
          code: 'custom',
          path: ['migrationStatus'],
          message: 'Pending legacy identifiers cannot have a resolution or canonical target.',
        });
      }
    }

    if (legacy.migrationStatus === 'mapped') {
      if (legacy.resolvedAt === null || legacy.canonicalPath === null || targetCount !== 1) {
        context.addIssue({
          code: 'custom',
          path: ['canonicalPath'],
          message:
            'Mapped legacy identifiers require one target, a canonical path, and a resolution time.',
        });
      }

      if (legacy.sourceSystem === 'cryptopaymap_v2' && legacy.locationId === null) {
        context.addIssue({
          code: 'custom',
          path: ['locationId'],
          message: 'Legacy CryptoPayMap place IDs must map to physical locations.',
        });
      }

      if (legacy.sourceSystem === 'crypto_acceptance_registry' && legacy.entityId === null) {
        context.addIssue({
          code: 'custom',
          path: ['entityId'],
          message: 'Legacy online-registry IDs must map to entities.',
        });
      }
    }

    if (['unresolved', 'retired'].includes(legacy.migrationStatus)) {
      if (
        legacy.resolvedAt === null ||
        legacy.canonicalPath !== null ||
        targetCount !== 0 ||
        legacy.resolutionNote === null
      ) {
        context.addIssue({
          code: 'custom',
          path: ['resolutionNote'],
          message:
            'Unresolved and retired identifiers require a time and explanatory note, but no target.',
        });
      }
    }

    if (legacy.legacyPath !== null && legacy.legacyPath === legacy.canonicalPath) {
      context.addIssue({
        code: 'custom',
        path: ['canonicalPath'],
        message: 'Legacy and canonical paths must be different.',
      });
    }
  });

export type MediaAssetInput = z.infer<typeof mediaAssetInputSchema>;
export type MediaFileInput = z.infer<typeof mediaFileInputSchema>;
export type MediaPublicationInput = z.infer<typeof mediaPublicationInputSchema>;
export type LegacyPlaceIdInput = z.infer<typeof legacyPlaceIdInputSchema>;
