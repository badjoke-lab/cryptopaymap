import { z } from 'zod';
import {
  createR2PhotoQuarantineUploadAuthorizer,
  type R2PhotoUploadAuthorizerOptions,
} from './r2-photo-upload-authorizer';

const environmentSchema = z
  .object({
    CPM_PHOTO_R2_ACCOUNT_ID: z.string(),
    CPM_PHOTO_R2_ACCESS_KEY_ID: z.string(),
    CPM_PHOTO_R2_SECRET_ACCESS_KEY: z.string(),
    CPM_PHOTO_R2_QUARANTINE_BUCKET: z.string(),
  })
  .strict();

export type R2PhotoUploadEnvironment = Readonly<
  Record<string, unknown> & {
    CPM_PHOTO_R2_ACCOUNT_ID?: unknown;
    CPM_PHOTO_R2_ACCESS_KEY_ID?: unknown;
    CPM_PHOTO_R2_SECRET_ACCESS_KEY?: unknown;
    CPM_PHOTO_R2_QUARANTINE_BUCKET?: unknown;
  }
>;

export class R2PhotoUploadEnvironmentConfigurationError extends Error {
  constructor() {
    super('Private photo object-storage configuration is unavailable.');
    this.name = 'R2PhotoUploadEnvironmentConfigurationError';
  }
}

export function createR2PhotoQuarantineUploadAuthorizerFromEnvironment(
  environment: R2PhotoUploadEnvironment,
  options: R2PhotoUploadAuthorizerOptions = {},
) {
  try {
    const parsed = environmentSchema.parse({
      CPM_PHOTO_R2_ACCOUNT_ID: environment.CPM_PHOTO_R2_ACCOUNT_ID,
      CPM_PHOTO_R2_ACCESS_KEY_ID: environment.CPM_PHOTO_R2_ACCESS_KEY_ID,
      CPM_PHOTO_R2_SECRET_ACCESS_KEY: environment.CPM_PHOTO_R2_SECRET_ACCESS_KEY,
      CPM_PHOTO_R2_QUARANTINE_BUCKET: environment.CPM_PHOTO_R2_QUARANTINE_BUCKET,
    });
    return createR2PhotoQuarantineUploadAuthorizer(
      {
        accountId: parsed.CPM_PHOTO_R2_ACCOUNT_ID,
        accessKeyId: parsed.CPM_PHOTO_R2_ACCESS_KEY_ID,
        secretAccessKey: parsed.CPM_PHOTO_R2_SECRET_ACCESS_KEY,
        quarantineBucket: parsed.CPM_PHOTO_R2_QUARANTINE_BUCKET,
      },
      options,
    );
  } catch {
    throw new R2PhotoUploadEnvironmentConfigurationError();
  }
}
