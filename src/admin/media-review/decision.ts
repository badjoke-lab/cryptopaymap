import { z } from 'zod';
import {
  mediaPurposeValues,
  mediaReviewStatusValues,
  mediaRightsStatusValues,
  mediaRoleValues,
  mediaStorageScopeValues,
  mediaVariantValues,
  mediaVisibilityValues,
} from '../../db/schema';

export const mediaReviewCapabilityValues = ['media:review'] as const;
export const mediaReviewActionValues = [
  'approve_private',
  'approve_public',
  'reject',
  'restrict',
  'supersede',
] as const;
export const mediaReviewTargetMatchValues = ['confirmed', 'uncertain', 'wrong_target'] as const;
export const mediaReviewPrivacyValues = ['cleared', 'private_only', 'blocked'] as const;
export const mediaReviewSubjectTypeValues = [
  'entity',
  'location',
  'claim',
  'evidence',
  'submission',
  'source_record',
] as const;

const nullableUuidSchema = z.uuid().nullable();
const reasonCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);

export const mediaReviewMutationContextSchema = z
  .object({
    requestId: z.uuid(),
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(z.enum(mediaReviewCapabilityValues)).min(1),
  })
  .strict();

export const mediaReviewSubjectSchema = z
  .object({
    type: z.enum(mediaReviewSubjectTypeValues),
    id: z.uuid(),
  })
  .strict();

export const mediaReviewFileSnapshotSchema = z
  .object({
    id: z.uuid(),
    variant: z.enum(mediaVariantValues),
    storageScope: z.enum(mediaStorageScopeValues),
    storageKey: z.string().trim().min(1).max(1_024),
    mimeType: z.string().trim().min(1).max(127),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
  })
  .strict()
  .superRefine((file, context) => {
    if ((file.width === null) !== (file.height === null)) {
      context.addIssue({
        code: 'custom',
        path: ['width'],
        message: 'Media file dimensions must both be present or both be absent.',
      });
    }
  });

export const mediaReviewRightsDecisionSchema = z
  .object({
    status: z.enum(mediaRightsStatusValues),
    licenseId: nullableUuidSchema,
    rightsHolder: z.string().trim().min(1).max(200).nullable(),
    consentReference: z.string().trim().min(1).max(256).nullable(),
    attribution: z.string().trim().min(1).max(1_000).nullable(),
    licenseAttributionRequired: z.boolean().nullable(),
  })
  .strict();

const mediaReviewDecisionBaseSchema = z
  .object({
    mediaAssetId: z.uuid(),
    expectedMediaUpdatedAt: z.iso.datetime({ offset: true }),
    expectedReviewStatus: z.enum(mediaReviewStatusValues),
    expectedPurpose: z.enum(mediaPurposeValues),
    expectedRole: z.enum(mediaRoleValues),
    expectedRightsStatus: z.enum(mediaRightsStatusValues),
    expectedVisibility: z.enum(mediaVisibilityValues),
    expectedSubject: mediaReviewSubjectSchema,
    expectedFiles: z.array(mediaReviewFileSnapshotSchema).max(3),
    decidedAt: z.iso.datetime({ offset: true }),
    action: z.enum(mediaReviewActionValues),
    targetMatch: z.enum(mediaReviewTargetMatchValues),
    privacyReview: z.enum(mediaReviewPrivacyValues),
    rightsDecision: mediaReviewRightsDecisionSchema.nullable(),
    altText: z.string().trim().min(1).max(500).nullable(),
    displayOrder: z.number().int().min(0).nullable(),
    publicDisplayFileId: nullableUuidSchema,
    publicThumbnailFileId: nullableUuidSchema,
    reasonCode: reasonCodeSchema,
    publicSummary: z.string().trim().min(1).max(1_000).nullable(),
    internalNote: z.string().trim().min(1).max(2_000).nullable(),
  })
  .strict();

type MediaReviewDecisionShape = z.infer<typeof mediaReviewDecisionBaseSchema>;
type MediaReviewRefinementContext = Parameters<
  Parameters<typeof mediaReviewDecisionBaseSchema.superRefine>[0]
>[1];

function addIssue(
  context: MediaReviewRefinementContext,
  path: (string | number)[],
  message: string,
) {
  context.addIssue({ code: 'custom', path, message });
}

function hasPublicFields(decision: MediaReviewDecisionShape): boolean {
  return (
    decision.rightsDecision !== null ||
    decision.altText !== null ||
    decision.displayOrder !== null ||
    decision.publicDisplayFileId !== null ||
    decision.publicThumbnailFileId !== null
  );
}

function validateFiles(
  decision: MediaReviewDecisionShape,
  context: MediaReviewRefinementContext,
) {
  const ids = decision.expectedFiles.map((file) => file.id);
  const variants = decision.expectedFiles.map((file) => file.variant);
  if (new Set(ids).size !== ids.length) {
    addIssue(context, ['expectedFiles'], 'Expected media file IDs must be unique.');
  }
  if (new Set(variants).size !== variants.length) {
    addIssue(context, ['expectedFiles'], 'Expected media file variants must be unique.');
  }
  if (
    decision.expectedFiles.some(
      (file) => file.variant === 'original' && file.storageScope === 'public',
    )
  ) {
    addIssue(context, ['expectedFiles'], 'Original media files cannot use public storage.');
  }
}

function validatePrivateApproval(
  decision: MediaReviewDecisionShape,
  context: MediaReviewRefinementContext,
) {
  if (
    decision.expectedReviewStatus !== 'pending' ||
    !['evidence', 'owner_verification'].includes(decision.expectedPurpose) ||
    decision.expectedVisibility !== 'private' ||
    decision.targetMatch !== 'confirmed' ||
    decision.privacyReview === 'blocked' ||
    hasPublicFields(decision)
  ) {
    addIssue(
      context,
      ['action'],
      'Private approval requires pending private Evidence or owner proof and no public fields.',
    );
  }
}

function validatePublicRights(
  decision: MediaReviewDecisionShape,
  context: MediaReviewRefinementContext,
) {
  const rights = decision.rightsDecision;
  if (
    rights === null ||
    !['submitted_with_permission', 'licensed', 'public_domain'].includes(rights.status)
  ) {
    addIssue(context, ['rightsDecision'], 'Public approval requires publishable rights.');
    return;
  }
  if (rights.status === 'licensed' && rights.licenseId === null) {
    addIssue(context, ['rightsDecision', 'licenseId'], 'Licensed media requires a license.');
  }
  if (
    rights.status === 'submitted_with_permission' &&
    rights.rightsHolder === null &&
    rights.consentReference === null
  ) {
    addIssue(
      context,
      ['rightsDecision', 'consentReference'],
      'Submitted media requires a rights holder or consent reference.',
    );
  }
  if (rights.licenseAttributionRequired === true && rights.attribution === null) {
    addIssue(context, ['rightsDecision', 'attribution'], 'The selected license requires attribution.');
  }
}

function validatePublicDerivative(
  decision: MediaReviewDecisionShape,
  context: MediaReviewRefinementContext,
  path: 'publicDisplayFileId' | 'publicThumbnailFileId',
  expectedVariant: 'display' | 'thumbnail',
) {
  const id = decision[path];
  if (id === null) return;
  const file = decision.expectedFiles.find((candidate) => candidate.id === id);
  if (
    file === undefined ||
    file.variant !== expectedVariant ||
    file.storageScope !== 'public' ||
    !['image/jpeg', 'image/webp'].includes(file.mimeType)
  ) {
    addIssue(
      context,
      [path],
      `The selected ${expectedVariant} must be a reviewed public JPEG or WebP derivative.`,
    );
  }
}

function validatePublicApproval(
  decision: MediaReviewDecisionShape,
  context: MediaReviewRefinementContext,
) {
  if (
    decision.expectedReviewStatus !== 'pending' ||
    !['public_gallery_candidate', 'canonical_logo'].includes(decision.expectedPurpose) ||
    decision.expectedVisibility !== 'private' ||
    decision.targetMatch !== 'confirmed' ||
    decision.privacyReview !== 'cleared'
  ) {
    addIssue(
      context,
      ['action'],
      'Public approval requires pending private gallery or logo media cleared for its target.',
    );
  }
  validatePublicRights(decision, context);
  if (
    decision.altText === null ||
    decision.displayOrder === null ||
    decision.publicDisplayFileId === null
  ) {
    addIssue(
      context,
      ['publicDisplayFileId'],
      'Public approval requires alt text, display order, and a public display derivative.',
    );
  }
  validatePublicDerivative(decision, context, 'publicDisplayFileId', 'display');
  validatePublicDerivative(decision, context, 'publicThumbnailFileId', 'thumbnail');
}

function validateNonApprovalAction(
  decision: MediaReviewDecisionShape,
  context: MediaReviewRefinementContext,
) {
  if (hasPublicFields(decision)) {
    addIssue(
      context,
      ['rightsDecision'],
      'Reject, restrict, and supersede actions cannot change public media fields.',
    );
  }
  if (decision.action === 'reject' && decision.expectedReviewStatus !== 'pending') {
    addIssue(context, ['expectedReviewStatus'], 'Only pending media can be rejected.');
  }
  if (
    decision.action === 'restrict' &&
    (decision.expectedReviewStatus !== 'accepted' || decision.expectedVisibility !== 'public')
  ) {
    addIssue(context, ['action'], 'Only accepted public media can be restricted.');
  }
  if (
    decision.action === 'supersede' &&
    (decision.expectedReviewStatus !== 'accepted' ||
      !['public', 'restricted'].includes(decision.expectedVisibility) ||
      !['public_gallery', 'canonical_logo'].includes(decision.expectedPurpose))
  ) {
    addIssue(
      context,
      ['action'],
      'Only accepted public or restricted gallery media can be superseded.',
    );
  }
}

export const mediaReviewDecisionInputSchema = mediaReviewDecisionBaseSchema.superRefine(
  (decision, context) => {
    if (Date.parse(decision.decidedAt) < Date.parse(decision.expectedMediaUpdatedAt)) {
      addIssue(
        context,
        ['decidedAt'],
        'The media decision cannot precede the reviewed media version.',
      );
    }
    if (decision.publicSummary === null && decision.internalNote === null) {
      addIssue(
        context,
        ['internalNote'],
        'A media review decision requires a public summary or internal note.',
      );
    }
    validateFiles(decision, context);
    if (decision.action === 'approve_private') {
      validatePrivateApproval(decision, context);
    } else if (decision.action === 'approve_public') {
      validatePublicApproval(decision, context);
    } else {
      validateNonApprovalAction(decision, context);
    }
  },
);

export type MediaReviewMutationContext = z.infer<typeof mediaReviewMutationContextSchema>;
export type MediaReviewDecisionInput = z.infer<typeof mediaReviewDecisionInputSchema>;
export type MediaReviewAction = MediaReviewDecisionInput['action'];
export type MediaReviewSubject = MediaReviewDecisionInput['expectedSubject'];
export type MediaReviewFileSnapshot = MediaReviewDecisionInput['expectedFiles'][number];
export type MediaReviewRightsDecision = NonNullable<MediaReviewDecisionInput['rightsDecision']>;

export interface MediaReviewDecisionCommand {
  requestId: string;
  actorId: string;
  actorType: 'human' | 'system';
  mediaAssetId: string;
  expectedMediaUpdatedAt: Date;
  expectedReviewStatus: MediaReviewDecisionInput['expectedReviewStatus'];
  expectedPurpose: MediaReviewDecisionInput['expectedPurpose'];
  expectedRole: MediaReviewDecisionInput['expectedRole'];
  expectedRightsStatus: MediaReviewDecisionInput['expectedRightsStatus'];
  expectedVisibility: MediaReviewDecisionInput['expectedVisibility'];
  expectedSubject: MediaReviewSubject;
  expectedFiles: MediaReviewFileSnapshot[];
  decidedAt: Date;
  action: MediaReviewAction;
  targetMatch: MediaReviewDecisionInput['targetMatch'];
  privacyReview: MediaReviewDecisionInput['privacyReview'];
  rightsDecision: MediaReviewRightsDecision | null;
  altText: string | null;
  displayOrder: number | null;
  publicDisplayFileId: string | null;
  publicThumbnailFileId: string | null;
  reasonCode: string;
  publicSummary: string | null;
  internalNote: string | null;
  requestFingerprint: string;
}

export interface MediaReviewDecisionReceipt {
  requestId: string;
  mediaAssetId: string;
  action: MediaReviewAction;
  reviewStatus: MediaReviewDecisionInput['expectedReviewStatus'];
  purpose: MediaReviewDecisionInput['expectedPurpose'];
  rightsStatus: MediaReviewDecisionInput['expectedRightsStatus'];
  visibility: MediaReviewDecisionInput['expectedVisibility'];
  decidedAt: string;
  publicFileIds: string[];
  state: 'committed' | 'replayed';
}

export interface MediaReviewDecisionBackend {
  commitDecision(command: MediaReviewDecisionCommand): Promise<MediaReviewDecisionReceipt>;
}

export type MediaReviewDecisionErrorCode =
  | 'unauthorized'
  | 'invalid_decision'
  | 'not_found'
  | 'conflict'
  | 'backend_failure';

export class MediaReviewDecisionError extends Error {
  readonly code: MediaReviewDecisionErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: MediaReviewDecisionErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MediaReviewDecisionError';
    this.code = code;
    this.issues = issues;
  }
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

function buildCommand(
  context: MediaReviewMutationContext,
  input: MediaReviewDecisionInput,
): MediaReviewDecisionCommand {
  const expectedFiles = [...input.expectedFiles].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const requestFingerprint = JSON.stringify(
    stable({
      requestId: context.requestId,
      actorId: context.actorId,
      actorType: context.actorType,
      ...input,
      expectedFiles,
    }),
  );
  return {
    requestId: context.requestId,
    actorId: context.actorId,
    actorType: context.actorType,
    mediaAssetId: input.mediaAssetId,
    expectedMediaUpdatedAt: new Date(input.expectedMediaUpdatedAt),
    expectedReviewStatus: input.expectedReviewStatus,
    expectedPurpose: input.expectedPurpose,
    expectedRole: input.expectedRole,
    expectedRightsStatus: input.expectedRightsStatus,
    expectedVisibility: input.expectedVisibility,
    expectedSubject: input.expectedSubject,
    expectedFiles,
    decidedAt: new Date(input.decidedAt),
    action: input.action,
    targetMatch: input.targetMatch,
    privacyReview: input.privacyReview,
    rightsDecision: input.rightsDecision,
    altText: input.altText,
    displayOrder: input.displayOrder,
    publicDisplayFileId: input.publicDisplayFileId,
    publicThumbnailFileId: input.publicThumbnailFileId,
    reasonCode: input.reasonCode,
    publicSummary: input.publicSummary,
    internalNote: input.internalNote,
    requestFingerprint,
  };
}

export function createMediaReviewDecisionService(backend: MediaReviewDecisionBackend) {
  return {
    async decide(
      context: MediaReviewMutationContext,
      input: MediaReviewDecisionInput,
    ): Promise<MediaReviewDecisionReceipt> {
      const contextResult = mediaReviewMutationContextSchema.safeParse(context);
      if (!contextResult.success || !context.capabilities.includes('media:review')) {
        throw new MediaReviewDecisionError(
          'unauthorized',
          'The actor is not authorized to review media.',
          contextResult.success
            ? []
            : contextResult.error.issues.map(
                (issue) => `${issue.path.join('.')}: ${issue.message}`,
              ),
        );
      }
      const inputResult = mediaReviewDecisionInputSchema.safeParse(input);
      if (!inputResult.success) {
        throw new MediaReviewDecisionError(
          'invalid_decision',
          'The media review decision is invalid.',
          inputResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        );
      }
      try {
        return await backend.commitDecision(buildCommand(contextResult.data, inputResult.data));
      } catch (error) {
        if (error instanceof MediaReviewDecisionError) throw error;
        throw new MediaReviewDecisionError(
          'backend_failure',
          'The media review decision was not committed.',
          [],
          { cause: error },
        );
      }
    },
  };
}
