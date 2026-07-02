import { z } from 'zod';
import { reconfirmationQueueItemSchema, type ReconfirmationQueueItem } from './queue';

export const reconfirmationQueueQuerySchema = z
  .object({
    dueSoonDays: z.number().int().min(1).max(90).default(30),
    limit: z.number().int().min(1).max(50).default(50),
  })
  .strict();

export const reconfirmationQueueResponseSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    query: reconfirmationQueueQuerySchema,
    items: z.array(reconfirmationQueueItemSchema).max(50),
    hasMore: z.boolean(),
  })
  .strict();

export type ReconfirmationQueueQuery = z.infer<typeof reconfirmationQueueQuerySchema>;
export type ReconfirmationQueueResponse = z.infer<typeof reconfirmationQueueResponseSchema>;

export interface ReconfirmationQueueBackend {
  loadQueue(
    query: ReconfirmationQueueQuery,
    asOf: Date,
  ): Promise<{ items: ReconfirmationQueueItem[]; hasMore: boolean }>;
}

export async function loadReconfirmationQueue(
  backend: ReconfirmationQueueBackend,
  query: ReconfirmationQueueQuery,
  asOf: Date,
): Promise<ReconfirmationQueueResponse> {
  const parsedQuery = reconfirmationQueueQuerySchema.parse(query);
  const result = await backend.loadQueue(parsedQuery, asOf);
  return reconfirmationQueueResponseSchema.parse({
    generatedAt: asOf.toISOString(),
    query: parsedQuery,
    items: result.items,
    hasMore: result.hasMore,
  });
}
