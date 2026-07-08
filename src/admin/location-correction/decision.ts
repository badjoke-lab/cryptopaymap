import { z } from 'zod';
import {
  canonicalLocationSchema,
  canonicalLocationSocialLinkSchema,
  type CanonicalLocationInput,
  type CanonicalLocationSocialLink,
} from '../../schemas/canonical-identity';
import { httpsUrlSchema } from '../../schemas/core';

export const locationCorrectionCapabilityValues = ['location:correct'] as const;

export const practicalLocationCorrectionFieldValues = [
  'addressLine',
  'locality',
  'region',
  'postalCode',
  'websiteUrl',
  'phone',
  'description',
  'openingHours',
  'amenities',
  'socialLinks',
] as const;

export type PracticalLocationCorrectionField =
  (typeof practicalLocationCorrectionFieldValues)[number];

const reasonCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);

const uniqueUuidArraySchema = z
  .array(z.uuid())
  .min(1)
  .max(100)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: 'custom', message: 'Source record IDs must be unique.' });
    }
  });

function nullableTextChangeSchema(maxLength: number) {
  return z.discriminatedUnion('operation', [
    z
      .object({
        operation: z.literal('set'),
        value: z.string().trim().min(1).max(maxLength),
      })
      .strict(),
    z.object({ operation: z.literal('clear') }).strict(),
  ]);
}

const nullableUrlChangeSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('set'), value: httpsUrlSchema }).strict(),
  z.object({ operation: z.literal('clear') }).strict(),
]);

const amenitySchema = z.string().trim().min(1).max(80);
const amenityValuesSchema = z
  .array(amenitySchema)
  .min(1)
  .max(100)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: 'custom', message: 'Amenity values must be unique.' });
    }
  });

const amenitiesChangeSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('add'), values: amenityValuesSchema }).strict(),
  z.object({ operation: z.literal('remove'), values: amenityValuesSchema }).strict(),
  z.object({ operation: z.literal('replace'), values: amenityValuesSchema }).strict(),
  z.object({ operation: z.literal('clear') }).strict(),
]);

const socialLinkIdentitySchema = canonicalLocationSocialLinkSchema.pick({
  platform: true,
  url: true,
});

function uniqueSocialLinksSchema(minimum: number) {
  return z
    .array(canonicalLocationSocialLinkSchema)
    .min(minimum)
    .max(30)
    .superRefine((links, context) => {
      const keys = links.map((link) => `${link.platform}:${link.url}`);
      if (new Set(keys).size !== keys.length) {
        context.addIssue({ code: 'custom', message: 'Social links must be unique.' });
      }
    });
}

const uniqueSocialLinkIdentitiesSchema = z
  .array(socialLinkIdentitySchema)
  .min(1)
  .max(30)
  .superRefine((links, context) => {
    const keys = links.map((link) => `${link.platform}:${link.url}`);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: 'custom', message: 'Social-link identities must be unique.' });
    }
  });

const socialLinksChangeSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('add'), values: uniqueSocialLinksSchema(1) }).strict(),
  z.object({ operation: z.literal('remove'), values: uniqueSocialLinkIdentitiesSchema }).strict(),
  z.object({ operation: z.literal('replace'), values: uniqueSocialLinksSchema(1) }).strict(),
  z.object({ operation: z.literal('clear') }).strict(),
]);

export const locationCorrectionChangesSchema = z
  .object({
    addressLine: nullableTextChangeSchema(500).optional(),
    locality: nullableTextChangeSchema(120).optional(),
    region: nullableTextChangeSchema(120).optional(),
    postalCode: nullableTextChangeSchema(32).optional(),
    websiteUrl: nullableUrlChangeSchema.optional(),
    phone: nullableTextChangeSchema(64).optional(),
    description: nullableTextChangeSchema(5_000).optional(),
    openingHours: nullableTextChangeSchema(2_000).optional(),
    amenities: amenitiesChangeSchema.optional(),
    socialLinks: socialLinksChangeSchema.optional(),
  })
  .strict()
  .superRefine((changes, context) => {
    if (Object.values(changes).every((change) => change === undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'At least one Location field change is required.',
      });
    }
  });

export const locationCorrectionProvenanceAssignmentSchema = z
  .object({
    fieldPath: z.enum(practicalLocationCorrectionFieldValues),
    sourceRecordIds: uniqueUuidArraySchema,
  })
  .strict();

export const locationCorrectionMutationContextSchema = z
  .object({
    requestId: z.uuid(),
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(z.enum(locationCorrectionCapabilityValues)).min(1),
  })
  .strict();

export const locationCorrectionDecisionInputSchema = z
  .object({
    locationId: z.uuid(),
    expectedLocationUpdatedAt: z.iso.datetime({ offset: true }),
    decidedAt: z.iso.datetime({ offset: true }),
    changes: locationCorrectionChangesSchema,
    sourceRecordIds: uniqueUuidArraySchema,
    provenanceAssignments: z.array(locationCorrectionProvenanceAssignmentSchema).min(1).max(10),
    reasonCode: reasonCodeSchema,
    publicSummary: z.string().trim().min(1).max(1_000).nullable(),
    internalNote: z.string().trim().min(1).max(2_000).nullable(),
  })
  .strict()
  .superRefine((input, context) => {
    if (Date.parse(input.decidedAt) < Date.parse(input.expectedLocationUpdatedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['decidedAt'],
        message: 'The correction decision cannot precede the reviewed Location version.',
      });
    }
    if (input.publicSummary === null && input.internalNote === null) {
      context.addIssue({
        code: 'custom',
        path: ['internalNote'],
        message: 'A correction decision requires a public summary or internal note.',
      });
    }

    const changedFields = new Set(
      practicalLocationCorrectionFieldValues.filter((field) => input.changes[field] !== undefined),
    );
    const assignmentFields = new Set<PracticalLocationCorrectionField>();
    const reviewedSources = new Set(input.sourceRecordIds);

    input.provenanceAssignments.forEach((assignment, index) => {
      if (assignmentFields.has(assignment.fieldPath)) {
        context.addIssue({
          code: 'custom',
          path: ['provenanceAssignments', index, 'fieldPath'],
          message: 'Each changed field accepts exactly one provenance assignment.',
        });
      }
      assignmentFields.add(assignment.fieldPath);
      if (!changedFields.has(assignment.fieldPath)) {
        context.addIssue({
          code: 'custom',
          path: ['provenanceAssignments', index, 'fieldPath'],
          message: 'Provenance cannot be assigned to an unchanged field.',
        });
      }
      assignment.sourceRecordIds.forEach((sourceRecordId) => {
        if (!reviewedSources.has(sourceRecordId)) {
          context.addIssue({
            code: 'custom',
            path: ['provenanceAssignments', index, 'sourceRecordIds'],
            message: 'Correction provenance references a source outside the reviewed source set.',
          });
        }
      });
    });

    for (const field of changedFields) {
      if (!assignmentFields.has(field)) {
        context.addIssue({
          code: 'custom',
          path: ['provenanceAssignments'],
          message: `${field} requires explicit correction provenance.`,
        });
      }
    }
  });

export type LocationCorrectionChanges = z.infer<typeof locationCorrectionChangesSchema>;
export type LocationCorrectionProvenanceAssignment = z.infer<
  typeof locationCorrectionProvenanceAssignmentSchema
>;
export type LocationCorrectionMutationContext = z.infer<
  typeof locationCorrectionMutationContextSchema
>;
export type LocationCorrectionDecisionInput = z.infer<typeof locationCorrectionDecisionInputSchema>;

export interface LocationCorrectionDecisionCommand {
  requestId: string;
  actorId: string;
  actorType: 'human' | 'system';
  locationId: string;
  expectedLocationUpdatedAt: Date;
  decidedAt: Date;
  changes: LocationCorrectionChanges;
  sourceRecordIds: string[];
  provenanceAssignments: LocationCorrectionProvenanceAssignment[];
  reasonCode: string;
  publicSummary: string | null;
  internalNote: string | null;
  requestFingerprint: string;
}

export interface LocationCorrectionDecisionReceipt {
  requestId: string;
  locationId: string;
  appliedFieldPaths: PracticalLocationCorrectionField[];
  decidedAt: string;
  updatedAt: string;
  state: 'committed' | 'replayed';
}

export interface LocationCorrectionDecisionBackend {
  commitCorrection(
    command: LocationCorrectionDecisionCommand,
  ): Promise<LocationCorrectionDecisionReceipt>;
}

export type LocationCorrectionDecisionErrorCode =
  | 'unauthorized'
  | 'invalid_decision'
  | 'not_found'
  | 'conflict'
  | 'backend_failure';

export class LocationCorrectionDecisionError extends Error {
  readonly code: LocationCorrectionDecisionErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: LocationCorrectionDecisionErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'LocationCorrectionDecisionError';
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

export function changedLocationCorrectionFields(
  changes: LocationCorrectionChanges,
): PracticalLocationCorrectionField[] {
  return practicalLocationCorrectionFieldValues.filter((field) => changes[field] !== undefined);
}

function applyNullableChange<T>(
  change: { operation: 'set'; value: T } | { operation: 'clear' },
): T | null {
  return change.operation === 'set' ? change.value : null;
}

function socialLinkKey(link: Pick<CanonicalLocationSocialLink, 'platform' | 'url'>): string {
  return `${link.platform}:${link.url}`;
}

export function applyLocationCorrectionChanges(
  current: CanonicalLocationInput,
  changes: LocationCorrectionChanges,
): CanonicalLocationInput {
  const next: CanonicalLocationInput = {
    ...current,
    ...(current.amenities === undefined ? {} : { amenities: [...current.amenities] }),
    ...(current.socialLinks === undefined
      ? {}
      : { socialLinks: current.socialLinks.map((link) => ({ ...link })) }),
  };

  for (const field of [
    'addressLine',
    'locality',
    'region',
    'postalCode',
    'websiteUrl',
    'phone',
    'description',
    'openingHours',
  ] as const) {
    const change = changes[field];
    if (change !== undefined) {
      next[field] = applyNullableChange(change);
    }
  }

  const amenitiesChange = changes.amenities;
  if (amenitiesChange !== undefined) {
    const currentAmenities = next.amenities ?? [];
    if (amenitiesChange.operation === 'add') {
      next.amenities = [...new Set([...currentAmenities, ...amenitiesChange.values])];
    } else if (amenitiesChange.operation === 'remove') {
      const removed = new Set(amenitiesChange.values);
      next.amenities = currentAmenities.filter((value) => !removed.has(value));
    } else if (amenitiesChange.operation === 'replace') {
      next.amenities = [...amenitiesChange.values];
    } else {
      next.amenities = [];
    }
  }

  const socialLinksChange = changes.socialLinks;
  if (socialLinksChange !== undefined) {
    const currentLinks = next.socialLinks ?? [];
    if (socialLinksChange.operation === 'add') {
      next.socialLinks = [
        ...currentLinks,
        ...socialLinksChange.values.map((link) => ({ ...link })),
      ];
    } else if (socialLinksChange.operation === 'remove') {
      const removed = new Set(socialLinksChange.values.map(socialLinkKey));
      next.socialLinks = currentLinks.filter((link) => !removed.has(socialLinkKey(link)));
    } else if (socialLinksChange.operation === 'replace') {
      next.socialLinks = socialLinksChange.values.map((link) => ({ ...link }));
    } else {
      next.socialLinks = [];
    }
  }

  const result = canonicalLocationSchema.safeParse(next);
  if (!result.success) {
    throw new LocationCorrectionDecisionError(
      'invalid_decision',
      'The correction would produce an invalid canonical Location.',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}

function normalizedAssignments(assignments: LocationCorrectionProvenanceAssignment[]) {
  return assignments
    .map((assignment) => ({
      fieldPath: assignment.fieldPath,
      sourceRecordIds: [...assignment.sourceRecordIds].sort(),
    }))
    .sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
}

function buildCommand(
  context: LocationCorrectionMutationContext,
  input: LocationCorrectionDecisionInput,
): LocationCorrectionDecisionCommand {
  const sourceRecordIds = [...input.sourceRecordIds].sort();
  const provenanceAssignments = normalizedAssignments(input.provenanceAssignments);
  const requestFingerprint = JSON.stringify(
    stable({
      requestId: context.requestId,
      actorId: context.actorId,
      actorType: context.actorType,
      ...input,
      sourceRecordIds,
      provenanceAssignments,
    }),
  );

  return {
    requestId: context.requestId,
    actorId: context.actorId,
    actorType: context.actorType,
    locationId: input.locationId,
    expectedLocationUpdatedAt: new Date(input.expectedLocationUpdatedAt),
    decidedAt: new Date(input.decidedAt),
    changes: input.changes,
    sourceRecordIds,
    provenanceAssignments,
    reasonCode: input.reasonCode,
    publicSummary: input.publicSummary,
    internalNote: input.internalNote,
    requestFingerprint,
  };
}

export function createLocationCorrectionDecisionService(
  backend: LocationCorrectionDecisionBackend,
) {
  return {
    async correct(
      context: LocationCorrectionMutationContext,
      input: LocationCorrectionDecisionInput,
    ): Promise<LocationCorrectionDecisionReceipt> {
      const contextResult = locationCorrectionMutationContextSchema.safeParse(context);
      if (!contextResult.success || !context.capabilities.includes('location:correct')) {
        throw new LocationCorrectionDecisionError(
          'unauthorized',
          'The actor is not authorized to correct canonical Location profiles.',
          contextResult.success
            ? []
            : contextResult.error.issues.map(
                (issue) => `${issue.path.join('.')}: ${issue.message}`,
              ),
        );
      }

      const inputResult = locationCorrectionDecisionInputSchema.safeParse(input);
      if (!inputResult.success) {
        throw new LocationCorrectionDecisionError(
          'invalid_decision',
          'The Location correction decision is invalid.',
          inputResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        );
      }

      try {
        return await backend.commitCorrection(buildCommand(contextResult.data, inputResult.data));
      } catch (error) {
        if (error instanceof LocationCorrectionDecisionError) throw error;
        throw new LocationCorrectionDecisionError(
          'backend_failure',
          'The Location correction decision was not committed.',
          [],
          { cause: error },
        );
      }
    },
  };
}
