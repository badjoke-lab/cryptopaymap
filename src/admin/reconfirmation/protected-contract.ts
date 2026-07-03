import { z } from 'zod';
import { reconfirmationQueueItemSchema } from './queue';

export const reconfirmationReadContextSchema = z
  .object({
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(z.literal('claim:recheck')).min(1),
  })
  .strict();

export const protectedReconfirmationQueueQuerySchema = z
  .object({
    dueSoonDays: z.coerce.number().int().min(1).max(90).default(30),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();

export const protectedReconfirmationQueueItemSchema = reconfirmationQueueItemSchema
  .extend({
    entityName: z.string().trim().min(1).max(160),
    entityType: z.enum([
      'merchant',
      'online_service',
      'payment_processor',
      'payment_program',
      'platform',
    ]),
    locationName: z.string().trim().min(1).max(160).nullable(),
    locationLocality: z.string().trim().min(1).max(120).nullable(),
    locationCountryCode: z.string().length(2).nullable(),
  })
  .strict();

export const protectedReconfirmationQueueResponseSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    query: protectedReconfirmationQueueQuerySchema,
    items: z.array(protectedReconfirmationQueueItemSchema).max(50),
    hasMore: z.boolean(),
  })
  .strict();

export const protectedReconfirmationDetailResponseSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    queueItem: protectedReconfirmationQueueItemSchema.nullable(),
    claim: z
      .object({
        id: z.uuid(),
        entityId: z.uuid(),
        locationId: z.uuid().nullable(),
        entityName: z.string().trim().min(1).max(160),
        entityType: z.enum([
          'merchant',
          'online_service',
          'payment_processor',
          'payment_program',
          'platform',
        ]),
        entityWebsiteUrl: z.string().nullable(),
        entityCountryCode: z.string().length(2).nullable(),
        locationName: z.string().trim().min(1).max(160).nullable(),
        locationSlug: z.string().trim().min(1).max(64).nullable(),
        locationAddressLine: z.string().nullable(),
        locationLocality: z.string().trim().min(1).max(120).nullable(),
        locationRegion: z.string().trim().min(1).max(120).nullable(),
        locationCountryCode: z.string().length(2).nullable(),
        claimScope: z.enum([
          'location_specific',
          'brand_region',
          'brand_global',
          'online_service',
          'platform_capability',
        ]),
        routeType: z.enum(['direct_wallet', 'processor_checkout']),
        acceptanceScope: z.enum([
          'all_checkout',
          'selected_products',
          'new_purchase_only',
          'renewal_only',
          'region_limited',
          'temporary',
        ]),
        claimStatus: z.enum(['candidate', 'confirmed', 'stale', 'ended', 'rejected']),
        visibility: z.enum(['public', 'hidden', 'temporarily_hidden']),
        customerPaysCrypto: z.boolean(),
        merchantExplicitlyAcceptsCrypto: z.boolean(),
        howToPay: z.string().nullable(),
        merchantReceives: z.enum(['crypto', 'fiat', 'crypto_or_fiat', 'not_publicly_confirmed']),
        restrictions: z.string().nullable(),
        firstConfirmedAt: z.iso.datetime({ offset: true }).nullable(),
        lastConfirmedAt: z.iso.datetime({ offset: true }).nullable(),
        nextReviewAt: z.iso.datetime({ offset: true }).nullable(),
        updatedAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
  })
  .strict();

export type ReconfirmationReadContext = z.infer<typeof reconfirmationReadContextSchema>;
export type ProtectedReconfirmationQueueQuery = z.infer<
  typeof protectedReconfirmationQueueQuerySchema
>;
export type ProtectedReconfirmationQueueItem = z.infer<
  typeof protectedReconfirmationQueueItemSchema
>;
export type ProtectedReconfirmationQueueResponse = z.infer<
  typeof protectedReconfirmationQueueResponseSchema
>;
export type ProtectedReconfirmationDetailResponse = z.infer<
  typeof protectedReconfirmationDetailResponseSchema
>;

export interface ProtectedReconfirmationWorkspaceBackend {
  loadQueue(
    query: ProtectedReconfirmationQueueQuery,
    asOf: Date,
  ): Promise<{ items: ProtectedReconfirmationQueueItem[]; hasMore: boolean }>;
  loadDetail(
    claimId: string,
    asOf: Date,
    dueSoonDays: number,
  ): Promise<ProtectedReconfirmationDetailResponse | null>;
}
