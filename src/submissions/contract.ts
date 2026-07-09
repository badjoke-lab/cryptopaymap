import { z } from 'zod';

export const submissionTypeValues = [
  'suggest',
  'payment_report',
  'problem_report',
  'claim',
  'photos',
] as const;
export const submissionTypeSchema = z.enum(submissionTypeValues);

export const submissionWorkflowStatusValues = [
  'received',
  'triage',
  'in_review',
  'needs_information',
  'on_hold',
  'resolved',
  'duplicate',
  'rejected_spam',
  'withdrawn',
] as const;
export const submissionWorkflowStatusSchema = z.enum(submissionWorkflowStatusValues);

export const submissionResolutionValues = [
  'approved',
  'partially_approved',
  'accepted_as_candidate',
  'not_approved',
  'duplicate',
  'no_change',
  'withdrawn',
] as const;
export const submissionResolutionSchema = z.enum(submissionResolutionValues);

export const submissionRelationshipValues = [
  'customer',
  'employee',
  'owner_or_authorized_representative',
  'payment_provider',
  'independent_researcher',
  'other',
] as const;
export const submissionRelationshipSchema = z.enum(submissionRelationshipValues);

export const submissionTargetTypeValues = ['entity', 'location', 'claim', 'new_record'] as const;
export const submissionTargetTypeSchema = z.enum(submissionTargetTypeValues);

export const submissionPublicIdSchema = z
  .string()
  .regex(/^CPM-S-\d{4}-\d{6}$/, 'Submission public references must use CPM-S-YYYY-NNNNNN.');

export const submissionStatusTokenHashSchema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/, 'Submission status token hashes must use sha256:<hex>.');

const safePlainTextSchema = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value.trim().length > 0, 'Text must contain non-whitespace content.')
    .refine((value) => !/[<>]/.test(value), 'HTML-like text is not accepted.');

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized === '0.0.0.0' ||
    normalized === '::1'
  ) {
    return true;
  }

  const octets = normalized.split('.').map((value) => Number(value));
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export const submissionEvidenceUrlSchema = z.url().superRefine((value, context) => {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    context.addIssue({ code: 'custom', message: 'Evidence URLs must use HTTP or HTTPS.' });
  }
  if (url.username.length > 0 || url.password.length > 0) {
    context.addIssue({ code: 'custom', message: 'Evidence URLs must not contain embedded credentials.' });
  }
  if (isBlockedHostname(url.hostname)) {
    context.addIssue({ code: 'custom', message: 'Evidence URLs must not target local or private hosts.' });
  }
});

export const submissionEvidenceLinkSchema = z
  .object({
    url: submissionEvidenceUrlSchema,
    observedAt: z.iso.date().nullable(),
    summary: safePlainTextSchema(1_000).nullable(),
  })
  .strict();

export const submissionContactInputSchema = z
  .object({
    email: z.email().max(320),
    contactAllowed: z.boolean(),
  })
  .strict();

export const submissionAcknowledgementsSchema = z
  .object({
    privacyNoticeAccepted: z.literal(true),
    submissionTermsAccepted: z.literal(true),
  })
  .strict();

export type SubmissionJsonValue =
  | null
  | boolean
  | number
  | string
  | SubmissionJsonValue[]
  | { [key: string]: SubmissionJsonValue };

export const submissionJsonValueSchema: z.ZodType<SubmissionJsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string().max(20_000),
    z.array(submissionJsonValueSchema).max(200),
    z.record(z.string().min(1).max(100), submissionJsonValueSchema),
  ]),
);

function jsonDepth(value: SubmissionJsonValue, depth = 0): number {
  if (value === null || typeof value !== 'object') return depth;
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.reduce((maximum, child) => Math.max(maximum, jsonDepth(child, depth + 1)), depth);
}

function jsonNodeCount(value: SubmissionJsonValue): number {
  if (value === null || typeof value !== 'object') return 1;
  const children = Array.isArray(value) ? value : Object.values(value);
  return 1 + children.reduce((count, child) => count + jsonNodeCount(child), 0);
}

export const submissionOriginalPayloadSchema = z
  .record(z.string().min(1).max(100), submissionJsonValueSchema)
  .superRefine((payload, context) => {
    const serialized = JSON.stringify(payload);
    if (serialized.length > 65_536) {
      context.addIssue({ code: 'custom', message: 'Submission payloads must be 64 KiB or smaller.' });
    }
    if (jsonDepth(payload) > 8) {
      context.addIssue({ code: 'custom', message: 'Submission payload nesting is too deep.' });
    }
    if (jsonNodeCount(payload) > 2_000) {
      context.addIssue({ code: 'custom', message: 'Submission payload contains too many values.' });
    }
  });

export const commonSubmissionIntakeSchema = z
  .object({
    schemaVersion: z.literal('submission-common-v1'),
    submissionType: submissionTypeSchema,
    targetType: submissionTargetTypeSchema.nullable(),
    targetId: z.uuid().nullable(),
    relationship: submissionRelationshipSchema.nullable(),
    contact: submissionContactInputSchema.nullable(),
    evidenceLinks: z.array(submissionEvidenceLinkSchema).max(10),
    originalPayload: submissionOriginalPayloadSchema,
    acknowledgements: submissionAcknowledgementsSchema,
  })
  .strict()
  .superRefine((intake, context) => {
    if ((intake.targetType === null) !== (intake.targetId === null)) {
      context.addIssue({
        code: 'custom',
        path: ['targetId'],
        message: 'Target type and target ID must either both be present or both be absent.',
      });
    }
  });

export const submissionRecordSchema = z
  .object({
    id: z.uuid(),
    publicId: submissionPublicIdSchema,
    submissionType: submissionTypeSchema,
    targetType: submissionTargetTypeSchema.nullable(),
    targetId: z.uuid().nullable(),
    workflowStatus: submissionWorkflowStatusSchema,
    resolution: submissionResolutionSchema.nullable(),
    priority: z.int().min(0).max(1_000).nullable(),
    statusTokenHash: submissionStatusTokenHashSchema,
    submittedAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    resolvedAt: z.iso.datetime({ offset: true }).nullable(),
    withdrawnAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.workflowStatus === 'resolved' && record.resolution === null) {
      context.addIssue({
        code: 'custom',
        path: ['resolution'],
        message: 'Resolved submissions require a resolution.',
      });
    }
    if (record.workflowStatus === 'duplicate' && ![null, 'duplicate'].includes(record.resolution)) {
      context.addIssue({
        code: 'custom',
        path: ['resolution'],
        message: 'Duplicate submissions may only use the duplicate resolution.',
      });
    }
    if (record.workflowStatus === 'withdrawn' && ![null, 'withdrawn'].includes(record.resolution)) {
      context.addIssue({
        code: 'custom',
        path: ['resolution'],
        message: 'Withdrawn submissions may only use the withdrawn resolution.',
      });
    }
  });

export const submissionPublicStatusLabelValues = [
  'received',
  'under_review',
  'more_information_needed',
  'on_hold',
  'approved',
  'partially_approved',
  'accepted_as_candidate',
  'not_approved',
  'closed',
] as const;
export const submissionPublicStatusLabelSchema = z.enum(submissionPublicStatusLabelValues);

export const submissionPermittedResponseActionValues = [
  'provide_information',
  'withdraw',
  'rotate_status_secret',
] as const;
export const submissionPermittedResponseActionSchema = z.enum(
  submissionPermittedResponseActionValues,
);

export const submissionPublicStatusProjectionSchema = z
  .object({
    publicId: submissionPublicIdSchema,
    statusLabel: submissionPublicStatusLabelSchema,
    requestedAction: safePlainTextSchema(500).nullable(),
    publicMessage: safePlainTextSchema(1_000).nullable(),
    linkedPublicRecord: z
      .object({
        recordType: z.enum(['place', 'online_service']),
        slug: z.string().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      })
      .strict()
      .nullable(),
    mediaDecisions: z
      .array(
        z
          .object({
            mediaReference: z.string().min(8).max(80).regex(/^[A-Z0-9_-]+$/),
            decision: z.enum(['pending', 'approved', 'rejected']),
          })
          .strict(),
      )
      .max(20),
    permittedActions: z.array(submissionPermittedResponseActionSchema).max(3),
  })
  .strict();

export type SubmissionType = z.infer<typeof submissionTypeSchema>;
export type SubmissionWorkflowStatus = z.infer<typeof submissionWorkflowStatusSchema>;
export type SubmissionResolution = z.infer<typeof submissionResolutionSchema>;
export type CommonSubmissionIntake = z.infer<typeof commonSubmissionIntakeSchema>;
export type SubmissionRecord = z.infer<typeof submissionRecordSchema>;
export type SubmissionPublicStatusLabel = z.infer<typeof submissionPublicStatusLabelSchema>;
export type SubmissionPublicStatusProjection = z.infer<
  typeof submissionPublicStatusProjectionSchema
>;

export function formatSubmissionPublicId(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error('Submission public reference year is invalid.');
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999_999) {
    throw new Error('Submission public reference sequence is invalid.');
  }
  return submissionPublicIdSchema.parse(`CPM-S-${year}-${sequence.toString().padStart(6, '0')}`);
}

export function publicStatusLabelForSubmission(
  workflowStatus: SubmissionWorkflowStatus,
  resolution: SubmissionResolution | null,
): SubmissionPublicStatusLabel {
  if (workflowStatus === 'received' || workflowStatus === 'triage') return 'received';
  if (workflowStatus === 'in_review') return 'under_review';
  if (workflowStatus === 'needs_information') return 'more_information_needed';
  if (workflowStatus === 'on_hold') return 'on_hold';
  if (workflowStatus !== 'resolved') return 'closed';

  switch (resolution) {
    case 'approved':
      return 'approved';
    case 'partially_approved':
      return 'partially_approved';
    case 'accepted_as_candidate':
      return 'accepted_as_candidate';
    case 'not_approved':
      return 'not_approved';
    case 'duplicate':
    case 'no_change':
    case 'withdrawn':
    case null:
      return 'closed';
  }
}
