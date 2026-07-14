import { z } from 'zod';
import {
  businessClaimEntityFieldDecisionSchema,
  businessClaimLocationFieldDecisionSchema,
  businessClaimPaymentProposalDecisionSchema,
} from './business-claim-field-application';

const timestampSchema = z.iso.datetime({ offset: true });

export const businessClaimFieldApplicationEditorRequestSchema = z
  .object({
    expectedSubmissionUpdatedAt: timestampSchema,
    expectedRelationshipDecisionId: z.uuid(),
    expectedEntityUpdatedAt: timestampSchema.nullable(),
    expectedLocationUpdatedAt: timestampSchema.nullable(),
    entityDecision: businessClaimEntityFieldDecisionSchema.nullable(),
    locationDecision: businessClaimLocationFieldDecisionSchema.nullable(),
    paymentDecision: businessClaimPaymentProposalDecisionSchema.nullable(),
  })
  .strict();

export type BusinessClaimFieldApplicationEditorRequest = z.infer<
  typeof businessClaimFieldApplicationEditorRequestSchema
>;
