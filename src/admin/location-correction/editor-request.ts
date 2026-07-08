import { z } from 'zod';
import {
  locationCorrectionChangesSchema,
  locationCorrectionProvenanceAssignmentSchema,
} from './decision';

const uniqueUuidArraySchema = z
  .array(z.uuid())
  .min(1)
  .max(100)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: 'custom', message: 'Source record IDs must be unique.' });
    }
  });

export const locationCorrectionEditorRequestSchema = z
  .object({
    expectedCandidateUpdatedAt: z.iso.datetime({ offset: true }),
    expectedLocationUpdatedAt: z.iso.datetime({ offset: true }),
    changes: locationCorrectionChangesSchema,
    sourceRecordIds: uniqueUuidArraySchema,
    provenanceAssignments: z.array(locationCorrectionProvenanceAssignmentSchema).min(1).max(10),
    reasonCode: z
      .string()
      .trim()
      .min(1)
      .max(96)
      .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
    publicSummary: z.string().trim().min(1).max(1_000).nullable(),
    internalNote: z.string().trim().min(1).max(2_000).nullable(),
  })
  .strict();

export type LocationCorrectionEditorRequest = z.infer<
  typeof locationCorrectionEditorRequestSchema
>;
