import { z } from 'zod';
import { ownershipVerificationMethodSchema } from './business-claim-contract';

const timestampSchema = z.iso.datetime({ offset: true });
const nullableUrlSchema = z.url().max(2_048).nullable();

export const businessClaimVerificationRequestEventPayloadSchema = z
  .object({
    schemaVersion: z.literal('business-claim-verification-request-event-v1'),
    preparationId: z.uuid(),
    targetType: z.enum(['entity', 'location']),
    targetId: z.uuid(),
    method: ownershipVerificationMethodSchema,
    officialDomain: z.string().trim().min(1).max(253).nullable(),
    officialWebsiteUrl: nullableUrlSchema,
    officialSocialUrl: nullableUrlSchema,
    protectedContactPresent: z.boolean(),
    privateProofPresent: z.boolean(),
    assistedVerifierReferencePresent: z.boolean(),
    expiresAt: timestampSchema,
  })
  .strict()
  .superRefine((payload, context) => {
    if (
      payload.method === 'official_domain_email' &&
      (payload.officialDomain === null || !payload.protectedContactPresent)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Official-domain email preparation requires a domain and protected contact.',
      });
    }
    if (payload.method === 'website_code' && payload.officialWebsiteUrl === null) {
      context.addIssue({
        code: 'custom',
        message: 'Website-code preparation requires an official website URL.',
      });
    }
    if (payload.method === 'dns_txt' && payload.officialDomain === null) {
      context.addIssue({
        code: 'custom',
        message: 'DNS TXT preparation requires an official domain.',
      });
    }
    if (payload.method === 'official_social' && payload.officialSocialUrl === null) {
      context.addIssue({
        code: 'custom',
        message: 'Official-social preparation requires an official social URL.',
      });
    }
    if (
      payload.method === 'assisted_verification' &&
      !payload.assistedVerifierReferencePresent
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Assisted verification preparation requires a protected verifier reference.',
      });
    }
  });

export type BusinessClaimVerificationRequestEventPayload = z.infer<
  typeof businessClaimVerificationRequestEventPayloadSchema
>;

export function serializeBusinessClaimVerificationRequestEventPayload(
  payload: BusinessClaimVerificationRequestEventPayload,
): string {
  return JSON.stringify(businessClaimVerificationRequestEventPayloadSchema.parse(payload));
}

export function parseBusinessClaimVerificationRequestEventPayload(
  value: string | null,
): BusinessClaimVerificationRequestEventPayload | null {
  if (value === null || value.length === 0 || value.length > 12_000) return null;
  try {
    return businessClaimVerificationRequestEventPayloadSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}
