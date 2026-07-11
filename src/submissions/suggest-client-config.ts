import { z } from 'zod';
import {
  createSubmissionTurnstileConfigurationFromEnvironment,
  type SubmissionTurnstileEnvironment,
} from './turnstile-environment';

export const suggestClientConfigurationSchema = z
  .object({
    siteKey: z.string().min(1).max(512).regex(/^\S+$/),
    action: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  })
  .strict();

export type SuggestClientConfiguration = z.infer<typeof suggestClientConfigurationSchema>;

export class SuggestClientConfigurationError extends Error {
  constructor() {
    super('Suggest client configuration is unavailable.');
    this.name = 'SuggestClientConfigurationError';
  }
}

export function readSuggestClientConfigurationFromEnvironment(
  environment: SubmissionTurnstileEnvironment,
): SuggestClientConfiguration {
  try {
    const configuration = createSubmissionTurnstileConfigurationFromEnvironment(environment);
    return suggestClientConfigurationSchema.parse(configuration.client);
  } catch {
    throw new SuggestClientConfigurationError();
  }
}
