import { z } from 'zod';

const accessAudienceSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/i, 'Cloudflare Access AUD must be a 64-character hexadecimal tag.')
  .transform((value) => value.toLowerCase());

const accessTeamDomainSchema = z
  .string()
  .trim()
  .url()
  .transform((value, context) => {
    const url = new URL(value);
    const isCloudflareAccessDomain =
      url.protocol === 'https:' &&
      url.hostname.endsWith('.cloudflareaccess.com') &&
      url.hostname !== 'cloudflareaccess.com' &&
      url.username === '' &&
      url.password === '' &&
      url.port === '' &&
      (url.pathname === '/' || url.pathname === '') &&
      url.search === '' &&
      url.hash === '';

    if (!isCloudflareAccessDomain) {
      context.addIssue({
        code: 'custom',
        message: 'Use the HTTPS Cloudflare Access team origin without a path, query, or fragment.',
      });
      return z.NEVER;
    }

    return url.origin;
  });

export const adminAccessEnvironmentSchema = z
  .object({
    CF_ACCESS_TEAM_DOMAIN: accessTeamDomainSchema,
    CF_ACCESS_AUD: accessAudienceSchema,
  })
  .passthrough();

export interface AdminAccessEnvironment {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  [key: string]: unknown;
}

export interface AdminAccessConfiguration {
  domain: string;
  aud: string;
}

export class AdminAccessConfigurationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super('Cloudflare Access is not configured for the administration route.');
    this.name = 'AdminAccessConfigurationError';
    this.issues = issues;
  }
}

export function readAdminAccessConfiguration(
  environment: AdminAccessEnvironment,
): AdminAccessConfiguration {
  const result = adminAccessEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new AdminAccessConfigurationError(
      result.error.issues.map((issue) => {
        const path = issue.path.length === 0 ? '$' : issue.path.map(String).join('.');
        return `${path}: ${issue.message}`;
      }),
    );
  }

  return {
    domain: result.data.CF_ACCESS_TEAM_DOMAIN,
    aud: result.data.CF_ACCESS_AUD,
  };
}

export function adminAccessUnavailableResponse(): Response {
  return new Response('Administration access is unavailable.', {
    status: 503,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
