import { z } from 'zod';
import {
  assetStatusValues,
  networkStatusValues,
  paymentMethodValues,
  paymentRegistryStatusValues,
} from '../../db/schema';
import { claimAssetPublicationContextSchema } from '../../schemas/claim-assets';

export const evidenceReviewPaymentCombinationSchema = z
  .object({
    id: z.uuid(),
    assetSymbol: z.string().trim().min(1).max(16),
    assetStatus: z.enum(assetStatusValues),
    networkSlug: z.string().trim().min(1).max(64),
    networkStatus: z.enum(networkStatusValues),
    paymentMethodSlug: z.enum(paymentMethodValues),
    paymentMethodStatus: z.enum(paymentRegistryStatusValues),
    isPrimary: z.boolean(),
  })
  .strict();

export const evidenceReviewPaymentPrerequisitesSchema = z
  .object({
    eligible: z.boolean(),
    issues: z.array(z.string().trim().min(1).max(500)).max(100),
  })
  .strict();

export type EvidenceReviewPaymentCombination = z.infer<
  typeof evidenceReviewPaymentCombinationSchema
>;
export type EvidenceReviewPaymentPrerequisites = z.infer<
  typeof evidenceReviewPaymentPrerequisitesSchema
>;

export function evaluateEvidenceReviewPaymentPrerequisites(
  routeType: 'direct_wallet' | 'processor_checkout',
  combinations: readonly EvidenceReviewPaymentCombination[],
): EvidenceReviewPaymentPrerequisites {
  const issues: string[] = [];

  if (combinations.length === 0) {
    issues.push('At least one payment combination is required before confirmation.');
  }

  if (combinations.filter((combination) => combination.isPrimary).length !== 1) {
    issues.push('Exactly one primary payment combination is required before confirmation.');
  }

  for (const combination of combinations) {
    const result = claimAssetPublicationContextSchema.safeParse({
      routeType,
      networkSlug: combination.networkSlug,
      paymentMethodSlug: combination.paymentMethodSlug,
      assetStatus: combination.assetStatus,
      networkStatus: combination.networkStatus,
      paymentMethodStatus: combination.paymentMethodStatus,
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push(`${combination.assetSymbol} on ${combination.networkSlug}: ${issue.message}`);
      }
    }
  }

  return {
    eligible: issues.length === 0,
    issues,
  };
}
