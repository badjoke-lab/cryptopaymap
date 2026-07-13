import { z } from 'zod';
import {
  createSubmissionTurnstileConfigurationFromEnvironment,
  type SubmissionTurnstileEnvironment,
} from './turnstile-environment';

export const reportClientConfigurationSchema = z
  .object({
    siteKey: z.string().min(1).max(512).regex(/^\S+$/),
    action: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  })
  .strict();

export type ReportClientConfiguration = z.infer<typeof reportClientConfigurationSchema>;

export class ReportClientConfigurationError extends Error {
  constructor() {
    super('Report client configuration is unavailable.');
    this.name = 'ReportClientConfigurationError';
  }
}

export function readReportClientConfigurationFromEnvironment(
  environment: SubmissionTurnstileEnvironment,
): ReportClientConfiguration {
  try {
    const configuration = createSubmissionTurnstileConfigurationFromEnvironment(environment);
    return reportClientConfigurationSchema.parse(configuration.client);
  } catch {
    throw new ReportClientConfigurationError();
  }
}
