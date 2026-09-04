import { z } from 'zod';

export const publicPlaceHistoryEventTypeValues = [
  'confirmed',
  'reconfirmed',
  'marked_stale',
  'ended',
  'rejected',
  'restored',
  'corrected',
  'hidden',
  'unhidden',
] as const;

const publicClaimStatusValues = [
  'candidate',
  'confirmed',
  'stale',
  'ended',
  'rejected',
] as const;

const publicClaimVisibilityValues = ['public', 'hidden', 'temporarily_hidden'] as const;

const publicSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a stable lowercase public slug.');

const timestampSchema = z.iso.datetime({ offset: true });

export const publicPlaceHistoryEventSchema = z
  .object({
    eventType: z.enum(publicPlaceHistoryEventTypeValues),
    effectiveAt: timestampSchema,
    summary: z.string().trim().min(1).max(2_000),
    fromStatus: z.enum(publicClaimStatusValues).nullable(),
    toStatus: z.enum(publicClaimStatusValues).nullable(),
    fromVisibility: z.enum(publicClaimVisibilityValues).nullable(),
    toVisibility: z.enum(publicClaimVisibilityValues).nullable(),
  })
  .strict();

export const publicPlaceHistoryRecordSchema = z
  .object({
    placeSlug: publicSlugSchema,
    verificationHistory: z.array(publicPlaceHistoryEventSchema).min(1).max(500),
    changeHistory: z.array(publicPlaceHistoryEventSchema).max(500),
  })
  .strict();

export const publicPlaceHistoryFileSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    generatedAt: timestampSchema,
    records: z.array(publicPlaceHistoryRecordSchema).max(100_000),
  })
  .strict()
  .superRefine((document, context) => {
    const slugs = new Set<string>();
    for (const [index, record] of document.records.entries()) {
      if (slugs.has(record.placeSlug)) {
        context.addIssue({
          code: 'custom',
          path: ['records', index, 'placeSlug'],
          message: 'Public Place history records must have unique place slugs.',
        });
      }
      slugs.add(record.placeSlug);
    }
  });

export type PublicPlaceHistoryEvent = z.infer<typeof publicPlaceHistoryEventSchema>;
export type PublicPlaceHistoryRecord = z.infer<typeof publicPlaceHistoryRecordSchema>;
export type PublicPlaceHistoryFile = z.infer<typeof publicPlaceHistoryFileSchema>;
