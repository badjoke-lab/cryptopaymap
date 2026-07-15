import { createDatabase } from '../db/client';
import type { R2BucketLike } from '../admin/media-review/r2-storage';
import { requiredDatabaseEnvironmentSchema } from '../schemas/environment';
import {
  createCloudflareImagesPhotoPrivateProcessor,
  type CloudflareImagesBindingLike,
} from './cloudflare-images-photo-processor';
import { createDrizzlePhotoMediaHandoffPersistence } from './drizzle-photo-private-processing';
import { createDrizzlePhotoUploadReservationPersistence } from './drizzle-photo-upload-reservations';
import { createDrizzlePhotoUploadTargetReader } from './drizzle-photo-upload-targets';
import { createPhotoPostIntakeObjectValidationService } from './photo-post-intake-object-validation';
import { createPhotoPrivateExecutionService } from './photo-private-execution';
import { createPhotoPrivateProcessingService } from './photo-private-processing';
import {
  createR2PhotoQuarantineObjectStore,
  type R2PhotoBucketLike,
} from './r2-photo-quarantine-object-store';
import { createR2PrivatePhotoDerivativeStore } from './r2-private-photo-derivatives';

export type PhotoPrivateExecutionEnvironment = Readonly<
  Record<string, unknown> & {
    DATABASE_URL?: unknown;
    PHOTO_PRIVATE_BUCKET?: unknown;
    IMAGES?: unknown;
  }
>;

type PhotoPrivateR2Bucket = R2PhotoBucketLike & R2BucketLike;

export class PhotoPrivateExecutionEnvironmentConfigurationError extends Error {
  constructor() {
    super('Private photo execution environment configuration is unavailable.');
    this.name = 'PhotoPrivateExecutionEnvironmentConfigurationError';
  }
}

function isPrivateR2Bucket(value: unknown): value is PhotoPrivateR2Bucket {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.get === 'function' &&
    typeof candidate.head === 'function' &&
    typeof candidate.put === 'function' &&
    typeof candidate.delete === 'function'
  );
}

function isCloudflareImagesBinding(value: unknown): value is CloudflareImagesBindingLike {
  if (value === null || typeof value !== 'object') return false;
  return typeof (value as Record<string, unknown>).input === 'function';
}

export function createPhotoPrivateExecutionRuntimeFromEnvironment(
  environment: PhotoPrivateExecutionEnvironment,
) {
  try {
    const databaseEnvironment = requiredDatabaseEnvironmentSchema.parse({
      DATABASE_URL: environment.DATABASE_URL,
    });
    if (
      !isPrivateR2Bucket(environment.PHOTO_PRIVATE_BUCKET) ||
      !isCloudflareImagesBinding(environment.IMAGES)
    ) {
      throw new PhotoPrivateExecutionEnvironmentConfigurationError();
    }

    const database = createDatabase(databaseEnvironment.DATABASE_URL);
    const persistence = createDrizzlePhotoMediaHandoffPersistence(database);
    const validation = createPhotoPostIntakeObjectValidationService({
      reservations: createDrizzlePhotoUploadReservationPersistence(database),
      targets: createDrizzlePhotoUploadTargetReader(database),
      objects: createR2PhotoQuarantineObjectStore(environment.PHOTO_PRIVATE_BUCKET),
    });
    const processing = createPhotoPrivateProcessingService({
      persistence,
      processor: createCloudflareImagesPhotoPrivateProcessor(environment.IMAGES),
      derivatives: createR2PrivatePhotoDerivativeStore(environment.PHOTO_PRIVATE_BUCKET),
    });

    return createPhotoPrivateExecutionService({
      contexts: persistence,
      validation,
      processing,
    });
  } catch (error) {
    if (error instanceof PhotoPrivateExecutionEnvironmentConfigurationError) throw error;
    throw new PhotoPrivateExecutionEnvironmentConfigurationError();
  }
}
