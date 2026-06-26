import { z } from 'zod';
import {
  assetStatusValues,
  networkStatusValues,
  paymentMethodValues,
  paymentRegistryStatusValues,
  routeTypeValues,
} from '../db/schema';
import { publicSlugSchema } from './core';

export const claimAssetInputSchema = z.object({
  claimId: z.uuid(),
  assetId: z.uuid(),
  networkId: z.uuid(),
  paymentMethodId: z.uuid(),
  contractAddress: z.string().trim().min(1).max(256).nullable(),
  isPrimary: z.boolean(),
  notes: z.string().trim().min(1).max(500).nullable(),
});

export const claimAssetSetSchema = z
  .array(claimAssetInputSchema)
  .min(1)
  .superRefine((rows, context) => {
    const primaryCount = rows.filter((row) => row.isPrimary).length;
    if (primaryCount !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'A publishable claim asset set requires exactly one primary combination.',
      });
    }

    const seen = new Set<string>();
    for (const [index, row] of rows.entries()) {
      const key = [
        row.claimId,
        row.assetId,
        row.networkId,
        row.paymentMethodId,
        row.contractAddress ?? '',
      ].join(':');

      if (seen.has(key)) {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: 'Duplicate claim asset combination.',
        });
      }
      seen.add(key);
    }
  });

export const claimAssetPublicationContextSchema = z
  .object({
    routeType: z.enum(routeTypeValues),
    networkSlug: publicSlugSchema,
    paymentMethodSlug: z.enum(paymentMethodValues),
    assetStatus: z.enum(assetStatusValues),
    networkStatus: z.enum(networkStatusValues),
    paymentMethodStatus: z.enum(paymentRegistryStatusValues),
  })
  .superRefine((combination, context) => {
    const lightningMethod = ['lightning_invoice', 'lightning_nfc'].includes(
      combination.paymentMethodSlug,
    );

    if (lightningMethod && combination.networkSlug !== 'lightning') {
      context.addIssue({
        code: 'custom',
        path: ['networkSlug'],
        message: 'Lightning payment methods require the Lightning network.',
      });
    }

    if (combination.paymentMethodSlug === 'onchain' && combination.networkSlug === 'lightning') {
      context.addIssue({
        code: 'custom',
        path: ['paymentMethodSlug'],
        message: 'The onchain payment method cannot use the Lightning network.',
      });
    }

    if (
      combination.paymentMethodSlug === 'processor_checkout' &&
      combination.routeType !== 'processor_checkout'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['paymentMethodSlug'],
        message: 'The processor checkout method requires the processor checkout route.',
      });
    }

    if (
      combination.assetStatus !== 'active' ||
      combination.networkStatus !== 'active' ||
      combination.paymentMethodStatus !== 'active'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Publishable combinations require active registry entries.',
      });
    }
  });

export function normalizeContractAddress(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

export type ClaimAssetInput = z.infer<typeof claimAssetInputSchema>;
export type ClaimAssetPublicationContext = z.infer<typeof claimAssetPublicationContextSchema>;
