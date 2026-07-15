import { z } from 'zod';
import {
  createSubmissionTurnstileConfigurationFromEnvironment,
  type SubmissionTurnstileEnvironment,
} from './turnstile-environment';

export const photoClientConfigurationSchema = z
  .object({
    siteKey: z.string().min(1).max(512).regex(/^\S+$/),
    action: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  })
  .strict();

export type PhotoClientConfiguration = z.infer<typeof photoClientConfigurationSchema>;

export class PhotoClientConfigurationError extends Error {
  constructor() {
    super('Photos client configuration is unavailable.');
    this.name = 'PhotoClientConfigurationError';
  }
}

export function readPhotoClientConfigurationFromEnvironment(
  environment: SubmissionTurnstileEnvironment,
): PhotoClientConfiguration {
  try {
    const configuration = createSubmissionTurnstileConfigurationFromEnvironment(environment);
    return photoClientConfigurationSchema.parse(configuration.client);
  } catch {
    throw new PhotoClientConfigurationError();
  }
}
