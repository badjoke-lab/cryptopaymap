import { createDatabase } from '../../db/client';
import { requiredDatabaseEnvironmentSchema } from '../../schemas/environment';
import type { MediaReviewAuthorizationEnvironment } from './authorization';
import {
  createMediaReviewDecisionService,
  type MediaReviewDecisionInput,
  type MediaReviewDecisionReceipt,
  type MediaReviewMutationContext,
} from './decision';
import { createDrizzleMediaReviewBackend } from './drizzle-backend';
import { createR2MediaStorageAdapter, type R2BucketLike } from './r2-storage';
import { createStorageAwareMediaReviewBackend } from './storage-backend';
import { MediaStorageError } from './storage-contract';

export interface MediaDecisionEnvironment extends MediaReviewAuthorizationEnvironment {
  DATABASE_URL?: string;
  CPM_MEDIA_PRIVATE_BUCKET?: R2BucketLike;
  CPM_MEDIA_PUBLIC_BUCKET?: R2BucketLike;
}

function databaseUrl(environment: MediaDecisionEnvironment): string {
  const result = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!result.success) throw new Error('Media review database unavailable.');
  return result.data.DATABASE_URL;
}

function storageAdapter(environment: MediaDecisionEnvironment) {
  if (
    environment.CPM_MEDIA_PRIVATE_BUCKET === undefined ||
    environment.CPM_MEDIA_PUBLIC_BUCKET === undefined
  ) {
    throw new MediaStorageError(
      'invalid_plan',
      'The Media review storage bindings are unavailable.',
    );
  }
  return createR2MediaStorageAdapter(
    environment.CPM_MEDIA_PRIVATE_BUCKET,
    environment.CPM_MEDIA_PUBLIC_BUCKET,
  );
}

export async function writeMediaDecision(
  context: MediaReviewMutationContext,
  mediaAssetId: string,
  body: unknown,
  environment: MediaDecisionEnvironment,
  decidedAt: Date,
): Promise<MediaReviewDecisionReceipt> {
  const input = {
    ...(body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {}),
    mediaAssetId,
    decidedAt: decidedAt.toISOString(),
  } as MediaReviewDecisionInput;
  const database = createDatabase(databaseUrl(environment));
  return createMediaReviewDecisionService(
    createStorageAwareMediaReviewBackend(
      createDrizzleMediaReviewBackend(database),
      storageAdapter(environment),
    ),
  ).decide(context, input);
}
