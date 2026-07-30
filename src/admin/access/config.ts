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

const canonicalHmacKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'Use an unpadded Base64URL value encoding 32 bytes.');

const clockSkewSchema = z.union([z.string(), z.number()]).transform((value, context) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 15 || parsed > 300) {
    context.addIssue({
      code: 'custom',
      message: 'The staging service authentication clock skew must be 15 to 300 seconds.',
    });
    return z.NEVER;
  }
  return parsed;
});

const cloudflareAccessEnvironmentSchema = z
  .object({
    CF_ACCESS_TEAM_DOMAIN: accessTeamDomainSchema,
    CF_ACCESS_AUD: accessAudienceSchema,
  })
  .passthrough();

const derivedStagingServiceEnvironmentSchema = z
  .object({
    CPM_STAGING_ADMIN_REVIEWER_HMAC_KEY_BASE64URL: canonicalHmacKeySchema,
    CPM_STAGING_ADMIN_PUBLISHER_HMAC_KEY_BASE64URL: canonicalHmacKeySchema,
    CPM_ADMIN_SERVICE_MAX_CLOCK_SKEW_SECONDS: clockSkewSchema.optional(),
  })
  .passthrough();

export interface AdminAccessEnvironment {
  CPM_ADMIN_AUTH_MODE?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  CPM_STAGING_ADMIN_REVIEWER_HMAC_KEY_BASE64URL?: string;
  CPM_STAGING_ADMIN_PUBLISHER_HMAC_KEY_BASE64URL?: string;
  CPM_ADMIN_SERVICE_MAX_CLOCK_SKEW_SECONDS?: string | number;
  [key: string]: unknown;
}

export interface CloudflareAdminAccessConfiguration {
  mode: 'cloudflare_access';
  domain: string;
  aud: string;
}

export interface DerivedStagingServiceConfiguration {
  mode: 'derived_staging_service';
  reviewerKeyBase64Url: string;
  publisherKeyBase64Url: string;
  maximumClockSkewSeconds: number;
}

export type AdminAccessConfiguration =
  | CloudflareAdminAccessConfiguration
  | DerivedStagingServiceConfiguration;

export class AdminAccessConfigurationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super('Administration access is not configured.');
    this.name = 'AdminAccessConfigurationError';
    this.issues = issues;
  }
}

function configurationIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length === 0 ? '$' : issue.path.map(String).join('.');
    return `${path}: ${issue.message}`;
  });
}

export function readAdminAccessConfiguration(
  environment: AdminAccessEnvironment,
): AdminAccessConfiguration {
  const mode = environment.CPM_ADMIN_AUTH_MODE?.trim() || 'cloudflare_access';
  if (mode === 'derived_staging_service') {
    const result = derivedStagingServiceEnvironmentSchema.safeParse(environment);
    if (!result.success) {
      throw new AdminAccessConfigurationError(configurationIssues(result.error));
    }
    return {
      mode,
      reviewerKeyBase64Url: result.data.CPM_STAGING_ADMIN_REVIEWER_HMAC_KEY_BASE64URL,
      publisherKeyBase64Url: result.data.CPM_STAGING_ADMIN_PUBLISHER_HMAC_KEY_BASE64URL,
      maximumClockSkewSeconds: result.data.CPM_ADMIN_SERVICE_MAX_CLOCK_SKEW_SECONDS ?? 90,
    };
  }
  if (mode !== 'cloudflare_access') {
    throw new AdminAccessConfigurationError(['CPM_ADMIN_AUTH_MODE: Unsupported mode.']);
  }
  const result = cloudflareAccessEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new AdminAccessConfigurationError(configurationIssues(result.error));
  }
  return {
    mode,
    domain: result.data.CF_ACCESS_TEAM_DOMAIN,
    aud: result.data.CF_ACCESS_AUD,
  };
}

const adminSecurityHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
} as const;

export function withAdminSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(adminSecurityHeaders)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function adminAccessFailureResponse(status: 403 | 503, message: string): Response {
  return withAdminSecurityHeaders(
    new Response(message, {
      status,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    }),
  );
}

export function adminAccessDeniedResponse(): Response {
  return adminAccessFailureResponse(403, 'Administration access was denied.');
}

export function adminAccessUnavailableResponse(): Response {
  return adminAccessFailureResponse(503, 'Administration access is unavailable.');
}
