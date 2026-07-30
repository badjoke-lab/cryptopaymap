from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_exact(path: str, old: str, new: str) -> None:
    target = ROOT / path
    content = target.read_text(encoding="utf-8")
    if old not in content:
        raise RuntimeError(f"Expected text not found in {path}")
    target.write_text(content.replace(old, new, 1), encoding="utf-8")


def replace_regex(path: str, pattern: str, replacement: str) -> None:
    target = ROOT / path
    content = target.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"Expected regex match not found in {path}: {pattern[:80]}")
    target.write_text(updated, encoding="utf-8")


write(
    "src/admin/access/config.ts",
    """import { z } from 'zod';

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
""",
)

write(
    "src/admin/access/identity.ts",
    """import { z } from 'zod';

const accessSubjectSchema = z.string().trim().min(1).max(200);
const serviceTokenCommonNameSchema = z
  .string()
  .trim()
  .min(8)
  .max(256)
  .regex(
    /^[A-Za-z0-9._:-]+\\.access$/,
    'Use the verified Cloudflare Access service-token common name.',
  );

const verifiedAccessPayloadSchema = z
  .object({
    sub: z.string().max(200),
    email: z.email().nullable().optional(),
    common_name: z.string().nullable().optional(),
    iss: z.url().optional(),
    aud: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .passthrough();

export type DerivedStagingServiceRole = 'reviewer' | 'publisher';

export interface AdminAccessIdentity {
  actorId: string;
  actorType: 'human' | 'system';
  subject: string;
  email: string | null;
}

export class AdminAccessIdentityError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super('The verified Cloudflare Access identity payload is invalid.');
    this.name = 'AdminAccessIdentityError';
    this.issues = issues;
  }
}

function identityError(issue: string): AdminAccessIdentityError {
  return new AdminAccessIdentityError([issue]);
}

export function createDerivedStagingServiceIdentity(
  role: DerivedStagingServiceRole,
): AdminAccessIdentity {
  const subject = `staging-service:${role}`;
  return Object.freeze({
    actorId: `cryptopaymap-service:${subject}`,
    actorType: 'system',
    subject,
    email: null,
  });
}

export function parseVerifiedAdminAccessIdentity(payload: unknown): AdminAccessIdentity {
  const result = verifiedAccessPayloadSchema.safeParse(payload);
  if (!result.success) {
    throw new AdminAccessIdentityError(
      result.error.issues.map((issue) => {
        const path = issue.path.length === 0 ? '$' : issue.path.map(String).join('.');
        return `${path}: ${issue.message}`;
      }),
    );
  }

  const subjectResult = accessSubjectSchema.safeParse(result.data.sub);
  if (subjectResult.success) {
    const email = result.data.email ?? null;
    return Object.freeze({
      actorId: `cloudflare-access:${subjectResult.data}`,
      actorType: email === null ? 'system' : 'human',
      subject: subjectResult.data,
      email,
    });
  }

  if (result.data.sub !== '') {
    throw identityError('sub: The verified Access subject is invalid.');
  }
  if (result.data.email !== undefined && result.data.email !== null) {
    throw identityError('email: A service-token identity must not contain a user email address.');
  }

  const commonNameResult = serviceTokenCommonNameSchema.safeParse(result.data.common_name);
  if (!commonNameResult.success) {
    throw identityError(
      'common_name: An empty Access subject requires a verified service-token common name.',
    );
  }

  const serviceSubject = `service-token:${commonNameResult.data}`;
  return Object.freeze({
    actorId: `cloudflare-access:${serviceSubject}`,
    actorType: 'system',
    subject: serviceSubject,
    email: null,
  });
}
""",
)

write(
    "src/admin/access/verification.ts",
    """import { z } from 'zod';
import type {
  AdminAccessConfiguration,
  CloudflareAdminAccessConfiguration,
  DerivedStagingServiceConfiguration,
} from './config';
import {
  createDerivedStagingServiceIdentity,
  parseVerifiedAdminAccessIdentity,
  type AdminAccessIdentity,
  type DerivedStagingServiceRole,
} from './identity';

const maximumAssertionLength = 16_384;
const derivedRoleHeader = 'X-CPM-Admin-Role';
const derivedTimestampHeader = 'X-CPM-Admin-Timestamp';
const derivedSignatureHeader = 'X-CPM-Admin-Signature';
const derivedSignatureVersion = 'cryptopaymap-staging-admin-v1';

const jwtHeaderSchema = z
  .object({
    alg: z.literal('RS256'),
    kid: z.string().trim().min(1).max(256),
  })
  .passthrough();

const audienceValueSchema = z.string().min(1).max(512);
const jwtClaimsSchema = z
  .object({
    sub: z.string().max(200),
    email: z.email().max(320).nullable().optional(),
    common_name: z.string().max(256).nullable().optional(),
    iss: z.url().max(2_048),
    aud: z.union([audienceValueSchema, z.array(audienceValueSchema).min(1).max(16)]),
    exp: z.number().int().positive(),
    nbf: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const signingKeySchema = z
  .object({
    kid: z.string().min(1).max(256),
    kty: z.literal('RSA'),
    alg: z.literal('RS256'),
    n: z.string().min(1).max(8_192),
    e: z.string().min(1).max(32),
  })
  .passthrough();

const certificatesSchema = z.object({
  keys: z.array(signingKeySchema).max(128),
});

const derivedRoleSchema = z.enum(['reviewer', 'publisher']);
const derivedTimestampSchema = z.string().regex(/^\\d{10}$/);
const derivedSignatureSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export interface AdminAccessVerificationDependencies {
  fetch?: typeof globalThis.fetch;
  crypto?: Pick<Crypto, 'subtle'>;
  now?: () => number;
}

export class AdminAccessVerificationError extends Error {
  constructor(message = 'Administration access verification failed.') {
    super(message);
    this.name = 'AdminAccessVerificationError';
  }
}

function verificationError(message: string): AdminAccessVerificationError {
  return new AdminAccessVerificationError(message);
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/').replace(/\\s/g, '');
    const paddingLength = (4 - (normalized.length % 4)) % 4;
    const decoded = globalThis.atob(normalized.padEnd(normalized.length + paddingLength, '='));
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw verificationError('The authentication value is not valid base64url data.');
  }
}

function decodeJsonSegment(value: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
  } catch (error) {
    if (error instanceof AdminAccessVerificationError) throw error;
    throw verificationError('The Access assertion contains invalid JSON.');
  }
}

function normalizeIssuer(value: string): string {
  const issuer = new URL(value);
  if (
    issuer.protocol !== 'https:' ||
    issuer.username !== '' ||
    issuer.password !== '' ||
    issuer.port !== '' ||
    (issuer.pathname !== '' && issuer.pathname !== '/') ||
    issuer.search !== '' ||
    issuer.hash !== ''
  ) {
    throw verificationError('The Access assertion issuer is invalid.');
  }
  return issuer.origin;
}

function derivedMessage(
  role: DerivedStagingServiceRole,
  timestamp: string,
  request: Request,
): Uint8Array<ArrayBuffer> {
  const url = new URL(request.url);
  return new TextEncoder().encode(
    [
      derivedSignatureVersion,
      role,
      timestamp,
      request.method.toUpperCase(),
      `${url.pathname}${url.search}`,
    ].join('\\n'),
  );
}

async function verifyDerivedStagingServiceRequest(
  request: Request,
  configuration: DerivedStagingServiceConfiguration,
  dependencies: AdminAccessVerificationDependencies,
): Promise<AdminAccessIdentity> {
  if (request.headers.has('Cf-Access-Authenticated-User-Email')) {
    throw verificationError('Unverified email headers are not accepted.');
  }
  const roleResult = derivedRoleSchema.safeParse(request.headers.get(derivedRoleHeader));
  const timestampResult = derivedTimestampSchema.safeParse(
    request.headers.get(derivedTimestampHeader),
  );
  const signatureResult = derivedSignatureSchema.safeParse(
    request.headers.get(derivedSignatureHeader),
  );
  if (!roleResult.success || !timestampResult.success || !signatureResult.success) {
    throw verificationError('The staging service authentication headers are invalid.');
  }

  const nowSeconds = Math.floor((dependencies.now?.() ?? Date.now()) / 1000);
  const timestampSeconds = Number(timestampResult.data);
  if (Math.abs(nowSeconds - timestampSeconds) > configuration.maximumClockSkewSeconds) {
    throw verificationError('The staging service authentication timestamp is outside the window.');
  }

  const cryptoImplementation = dependencies.crypto ?? globalThis.crypto;
  if (!cryptoImplementation?.subtle) {
    throw verificationError('The staging service verification runtime is unavailable.');
  }
  const keyValue =
    roleResult.data === 'reviewer'
      ? configuration.reviewerKeyBase64Url
      : configuration.publisherKeyBase64Url;
  let key: CryptoKey;
  try {
    key = await cryptoImplementation.subtle.importKey(
      'raw',
      decodeBase64Url(keyValue),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  } catch {
    throw verificationError('The staging service verification key could not be imported.');
  }
  const verified = await cryptoImplementation.subtle.verify(
    'HMAC',
    key,
    decodeBase64Url(signatureResult.data),
    derivedMessage(roleResult.data, timestampResult.data, request),
  );
  if (!verified) {
    throw verificationError('The staging service authentication signature is invalid.');
  }
  return createDerivedStagingServiceIdentity(roleResult.data);
}

async function verifyCloudflareAccessRequest(
  request: Request,
  configuration: CloudflareAdminAccessConfiguration,
  dependencies: AdminAccessVerificationDependencies,
): Promise<AdminAccessIdentity> {
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!assertion) {
    throw verificationError('The Access assertion is missing.');
  }
  if (assertion.length > maximumAssertionLength) {
    throw verificationError('The Access assertion exceeds the accepted size.');
  }

  const parts = assertion.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw verificationError('The Access assertion must contain three non-empty segments.');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
  const headerResult = jwtHeaderSchema.safeParse(decodeJsonSegment(encodedHeader));
  const claimsResult = jwtClaimsSchema.safeParse(decodeJsonSegment(encodedPayload));
  if (!headerResult.success || !claimsResult.success) {
    throw verificationError('The Access assertion header or claims are invalid.');
  }

  const fetchImplementation = dependencies.fetch ?? globalThis.fetch;
  const cryptoImplementation = dependencies.crypto ?? globalThis.crypto;
  if (!fetchImplementation || !cryptoImplementation?.subtle) {
    throw verificationError('The Access verification runtime is unavailable.');
  }

  const certificatesUrl = new URL('/cdn-cgi/access/certs', configuration.domain);
  let certificatesResponse: Response;
  try {
    certificatesResponse = await fetchImplementation(certificatesUrl, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw verificationError('Cloudflare Access signing keys could not be fetched.');
  }
  if (!certificatesResponse.ok) {
    throw verificationError('Cloudflare Access signing keys could not be fetched.');
  }

  let certificates: z.infer<typeof certificatesSchema>;
  try {
    certificates = certificatesSchema.parse(await certificatesResponse.json());
  } catch {
    throw verificationError('Cloudflare Access signing keys are invalid.');
  }

  const signingKey = certificates.keys.find((key) => key.kid === headerResult.data.kid);
  if (!signingKey) {
    throw verificationError('No matching Cloudflare Access signing key was found.');
  }

  let key: CryptoKey;
  try {
    key = await cryptoImplementation.subtle.importKey(
      'jwk',
      signingKey as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  } catch {
    throw verificationError('The Cloudflare Access signing key could not be imported.');
  }

  const verified = await cryptoImplementation.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!verified) {
    throw verificationError('The Access assertion signature is invalid.');
  }

  const claims = claimsResult.data;
  if (normalizeIssuer(claims.iss) !== configuration.domain) {
    throw verificationError('The Access assertion issuer does not match this application.');
  }

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(configuration.aud)) {
    throw verificationError('The Access assertion audience does not match this application.');
  }

  const nowSeconds = Math.floor((dependencies.now?.() ?? Date.now()) / 1000);
  if (nowSeconds >= claims.exp) {
    throw verificationError('The Access assertion has expired.');
  }
  if (claims.nbf !== undefined && nowSeconds < claims.nbf) {
    throw verificationError('The Access assertion is not yet valid.');
  }

  return parseVerifiedAdminAccessIdentity(claims);
}

export async function verifyAdminAccessRequest(
  request: Request,
  configuration: AdminAccessConfiguration,
  dependencies: AdminAccessVerificationDependencies = {},
): Promise<AdminAccessIdentity> {
  return configuration.mode === 'derived_staging_service'
    ? verifyDerivedStagingServiceRequest(request, configuration, dependencies)
    : verifyCloudflareAccessRequest(request, configuration, dependencies);
}
""",
)

write(
    "scripts/check-admin-access.ts",
    """import { createAdminAccessMiddleware } from '../functions/admin/_middleware';
import {
  AdminAccessConfigurationError,
  readAdminAccessConfiguration,
} from '../src/admin/access/config';
import { parseVerifiedAdminAccessIdentity } from '../src/admin/access/identity';

const cloudflareConfiguration = readAdminAccessConfiguration({
  CF_ACCESS_TEAM_DOMAIN: 'https://runtime-team.cloudflareaccess.com',
  CF_ACCESS_AUD: 'b'.repeat(64),
});
if (
  cloudflareConfiguration.mode !== 'cloudflare_access' ||
  cloudflareConfiguration.domain !== 'https://runtime-team.cloudflareaccess.com' ||
  cloudflareConfiguration.aud !== 'b'.repeat(64)
) {
  throw new Error('Administration Access configuration normalization failed.');
}

const derivedConfiguration = readAdminAccessConfiguration({
  CPM_ADMIN_AUTH_MODE: 'derived_staging_service',
  CPM_STAGING_ADMIN_REVIEWER_HMAC_KEY_BASE64URL: 'A'.repeat(43),
  CPM_STAGING_ADMIN_PUBLISHER_HMAC_KEY_BASE64URL: 'B'.repeat(43),
  CPM_ADMIN_SERVICE_MAX_CLOCK_SKEW_SECONDS: '90',
});
if (
  derivedConfiguration.mode !== 'derived_staging_service' ||
  derivedConfiguration.maximumClockSkewSeconds !== 90
) {
  throw new Error('Derived staging service configuration normalization failed.');
}

try {
  readAdminAccessConfiguration({});
  throw new Error('Missing Access configuration was accepted.');
} catch (error) {
  if (!(error instanceof AdminAccessConfigurationError)) throw error;
}

const identity = parseVerifiedAdminAccessIdentity({
  sub: 'runtime-reviewer-subject',
  email: 'runtime-reviewer@example.com',
});
if (
  identity.actorType !== 'human' ||
  identity.actorId !== 'cloudflare-access:runtime-reviewer-subject'
) {
  throw new Error('Verified Access identity normalization failed.');
}

let verifierInvocations = 0;
const middleware = createAdminAccessMiddleware(async (_request, verifierConfiguration) => {
  verifierInvocations += 1;
  if (
    verifierConfiguration.mode !== 'cloudflare_access' ||
    verifierConfiguration.domain !== cloudflareConfiguration.domain ||
    verifierConfiguration.aud !== cloudflareConfiguration.aud
  ) {
    throw new Error('Access verifier received incorrect configuration.');
  }
  return identity;
});

const data: Record<string, unknown> = {};
const response = await middleware({
  request: new Request('https://cryptopaymap.example/admin'),
  env: {
    CF_ACCESS_TEAM_DOMAIN: cloudflareConfiguration.domain,
    CF_ACCESS_AUD: cloudflareConfiguration.aud,
  },
  params: {},
  data,
  next: async () => new Response('verified'),
  waitUntil: () => undefined,
});

if (
  response.status !== 200 ||
  (await response.text()) !== 'verified' ||
  verifierInvocations !== 1 ||
  data.adminIdentity !== identity ||
  response.headers.get('cache-control') !== 'private, no-store'
) {
  throw new Error('Administration Access middleware delegation failed.');
}

const deniedMiddleware = createAdminAccessMiddleware(async () => {
  throw new Error('invalid assertion');
});
const deniedResponse = await deniedMiddleware({
  request: new Request('https://cryptopaymap.example/admin'),
  env: {
    CPM_ADMIN_AUTH_MODE: 'derived_staging_service',
    CPM_STAGING_ADMIN_REVIEWER_HMAC_KEY_BASE64URL: derivedConfiguration.reviewerKeyBase64Url,
    CPM_STAGING_ADMIN_PUBLISHER_HMAC_KEY_BASE64URL: derivedConfiguration.publisherKeyBase64Url,
  },
  params: {},
  data: {},
  next: async () => new Response('must not be served'),
  waitUntil: () => undefined,
});
if (deniedResponse.status !== 403) {
  throw new Error('Invalid administration assertion did not fail closed.');
}

console.log('Administration Access checks passed.');
""",
)

write(
    "tests/admin-derived-service-auth.test.ts",
    """import { describe, expect, it } from 'vitest';
import type { DerivedStagingServiceConfiguration } from '../src/admin/access/config';
import { verifyAdminAccessRequest } from '../src/admin/access/verification';

const now = 1_800_000_000_000;
const reviewerKey = new Uint8Array(32).fill(17);
const publisherKey = new Uint8Array(32).fill(23);

function base64Url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return globalThis
    .btoa(binary)
    .replace(/=/g, '')
    .replace(/\\+/g, '-')
    .replace(/\\//g, '_');
}

const configuration: DerivedStagingServiceConfiguration = {
  mode: 'derived_staging_service',
  reviewerKeyBase64Url: base64Url(reviewerKey),
  publisherKeyBase64Url: base64Url(publisherKey),
  maximumClockSkewSeconds: 90,
};

async function signedRequest(
  role: 'reviewer' | 'publisher',
  path: string,
  options: { method?: string; timestamp?: number; key?: Uint8Array; forgedEmail?: boolean } = {},
): Promise<Request> {
  const method = options.method ?? 'GET';
  const timestamp = String(options.timestamp ?? Math.floor(now / 1000));
  const keyBytes = options.key ?? (role === 'reviewer' ? reviewerKey : publisherKey);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const message = [
    'cryptopaymap-staging-admin-v1',
    role,
    timestamp,
    method,
    path,
  ].join('\\n');
  const signature = new Uint8Array(
    await globalThis.crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message)),
  );
  const headers = new Headers({
    'X-CPM-Admin-Role': role,
    'X-CPM-Admin-Timestamp': timestamp,
    'X-CPM-Admin-Signature': base64Url(signature),
  });
  if (options.forgedEmail) {
    headers.set('Cf-Access-Authenticated-User-Email', 'forged@example.invalid');
  }
  return new Request(`https://cryptopaymap.example${path}`, { method, headers });
}

describe('derived staging service authentication', () => {
  it('returns distinct bounded reviewer and publisher identities', async () => {
    await expect(
      verifyAdminAccessRequest(await signedRequest('reviewer', '/admin/api/dashboard'), configuration, {
        now: () => now,
      }),
    ).resolves.toEqual({
      actorId: 'cryptopaymap-service:staging-service:reviewer',
      actorType: 'system',
      subject: 'staging-service:reviewer',
      email: null,
    });
    await expect(
      verifyAdminAccessRequest(
        await signedRequest('publisher', '/admin/api/export-activate', { method: 'POST' }),
        configuration,
        { now: () => now },
      ),
    ).resolves.toEqual({
      actorId: 'cryptopaymap-service:staging-service:publisher',
      actorType: 'system',
      subject: 'staging-service:publisher',
      email: null,
    });
  });

  it('rejects a cross-role signature and a stale request', async () => {
    await expect(
      verifyAdminAccessRequest(
        await signedRequest('publisher', '/admin/api/export-activate', {
          method: 'POST',
          key: reviewerKey,
        }),
        configuration,
        { now: () => now },
      ),
    ).rejects.toThrow('signature');
    await expect(
      verifyAdminAccessRequest(
        await signedRequest('reviewer', '/admin/api/dashboard', {
          timestamp: Math.floor(now / 1000) - 91,
        }),
        configuration,
        { now: () => now },
      ),
    ).rejects.toThrow('timestamp');
  });

  it('rejects forged email headers even when the service signature is valid', async () => {
    await expect(
      verifyAdminAccessRequest(
        await signedRequest('reviewer', '/admin/api/dashboard', { forgedEmail: true }),
        configuration,
        { now: () => now },
      ),
    ).rejects.toThrow('email');
  });
});
""",
)

replace_exact(
    "tests/admin-access-verification.test.ts",
    "const configuration: AdminAccessConfiguration = {\n  domain: 'https://test-team.cloudflareaccess.com',",
    "const configuration: AdminAccessConfiguration = {\n  mode: 'cloudflare_access',\n  domain: 'https://test-team.cloudflareaccess.com',",
)

replace_exact(
    "src/admin/dashboard/identity-context.ts",
    """    if (identity.actorId !== `cloudflare-access:${identity.subject}`) {
      context.addIssue({
        code: 'custom',
        path: ['actorId'],
        message: 'The actor identifier does not match the verified subject.',
      });
    }
""",
    """    const expectedActorIds = new Set([
      `cloudflare-access:${identity.subject}`,
      `cryptopaymap-service:${identity.subject}`,
    ]);
    if (!expectedActorIds.has(identity.actorId)) {
      context.addIssue({
        code: 'custom',
        path: ['actorId'],
        message: 'The actor identifier does not match the verified subject.',
      });
    }
""",
)

replace_exact(
    "scripts/derive-suggest-review-secrets.mjs",
    """    CPM_SUGGEST_READINESS_TOKEN: `cpmrv_${derive(seed, 'suggest-readiness-token').toString('base64url')}`,
""",
    """    CPM_SUGGEST_READINESS_TOKEN: `cpmrv_${derive(seed, 'suggest-readiness-token').toString('base64url')}`,
    CPM_STAGING_ADMIN_REVIEWER_HMAC_KEY_BASE64URL: derive(
      seed,
      'staging-admin-reviewer-hmac-key',
    ).toString('base64url'),
    CPM_STAGING_ADMIN_PUBLISHER_HMAC_KEY_BASE64URL: derive(
      seed,
      'staging-admin-publisher-hmac-key',
    ).toString('base64url'),
""",
)

replace_exact(
    ".github/workflows/staging-review-deploy.yml",
    """            PUBLIC_TURNSTILE_ACTION: 'submission_intake',
          };
""",
    """            PUBLIC_TURNSTILE_ACTION: 'submission_intake',
            CPM_ADMIN_AUTH_MODE: 'derived_staging_service',
            CPM_ADMIN_SERVICE_MAX_CLOCK_SKEW_SECONDS: '90',
            CPM_ADMIN_DASHBOARD_SUBJECTS: '[\"staging-service:reviewer\"]',
            CPM_ADMIN_EXPORT_PUBLISH_ACTOR_IDS:
              '[\"cryptopaymap-service:staging-service:publisher\"]',
          };
""",
)

replace_exact(
    ".github/workflows/ops-p6-001e-configured-staging-p6-02-identity-admin.yml",
    """      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      CPM_STAGING_ACCESS_REVIEWER_CLIENT_ID: ${{ secrets.CPM_STAGING_ACCESS_REVIEWER_CLIENT_ID }}
      CPM_STAGING_ACCESS_REVIEWER_CLIENT_SECRET: ${{ secrets.CPM_STAGING_ACCESS_REVIEWER_CLIENT_SECRET }}
      CPM_STAGING_ACCESS_PUBLISHER_CLIENT_ID: ${{ secrets.CPM_STAGING_ACCESS_PUBLISHER_CLIENT_ID }}
      CPM_STAGING_ACCESS_PUBLISHER_CLIENT_SECRET: ${{ secrets.CPM_STAGING_ACCESS_PUBLISHER_CLIENT_SECRET }}
""",
    """      CPM_REVIEW_SECRET_SEED_BASE64URL: ${{ secrets.CPM_REVIEW_SECRET_SEED_BASE64URL }}
""",
)

replace_exact(
    ".github/workflows/ops-p6-001e-configured-staging-p6-02-identity-admin.yml",
    """      - name: Write bounded configured P6-02 receipt
""",
    """      - name: Derive bounded staging Admin service credentials
        working-directory: source
        run: |
          set -euo pipefail
          trap 'rm -f ../p6-02-derived-secrets.json' EXIT
          node scripts/derive-suggest-review-secrets.mjs ../p6-02-derived-secrets.json
          node <<'NODE'
          const { appendFileSync, readFileSync } = require('node:fs');
          const values = JSON.parse(readFileSync('../p6-02-derived-secrets.json', 'utf8'));
          const keys = [
            'CPM_STAGING_ADMIN_REVIEWER_HMAC_KEY_BASE64URL',
            'CPM_STAGING_ADMIN_PUBLISHER_HMAC_KEY_BASE64URL',
          ];
          for (const key of keys) {
            const value = values[key];
            if (typeof value !== 'string' || value.length === 0) throw new Error(`${key} missing`);
            console.log(`::add-mask::${value}`);
            appendFileSync(process.env.GITHUB_ENV, `${key}=${value}\n`);
          }
          NODE

      - name: Write bounded configured P6-02 receipt
""",
)

replace_exact(
    "scripts/run-ops-p6-001e-configured-staging-identity-admin.ts",
    "import { createHash } from 'node:crypto';",
    "import { createHash, createHmac } from 'node:crypto';",
)

replace_exact(
    "scripts/run-ops-p6-001e-configured-staging-identity-admin.ts",
    "  'cf_authorization',\n",
    "  'cf_authorization',\n  'x-cpm-admin-signature',\n",
)

replace_regex(
    "scripts/run-ops-p6-001e-configured-staging-identity-admin.ts",
    r"async function cloudflareApi\(token, accountId, path\) \{.*?\n\}\n\nfunction safeLocationClass",
    """function inspectControlPlane(credentials) {
  const missing = Object.entries(credentials)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    return {
      status: 'failed',
      mode: 'derived_staging_service',
      externalControlPlaneRequired: false,
      error: 'missing_derived_service_credentials',
      missing,
    };
  }
  return {
    status: 'passed',
    mode: 'derived_staging_service',
    externalControlPlaneRequired: false,
    credentialSource: 'existing_review_seed_hkdf',
    roleCount: 2,
    roleDigest: boundedHash(['reviewer', 'publisher']),
  };
}

function safeLocationClass""",
)

replace_regex(
    "scripts/run-ops-p6-001e-configured-staging-identity-admin.ts",
    r"function serviceHeaders\(clientId, clientSecret, extra = \{\}\) \{.*?\n\}\n\nexport async function evaluateConfiguredStagingIdentityAdmin",
    """function serviceHeaders(role, keyBase64Url, path, method, extra = {}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const message = [
    'cryptopaymap-staging-admin-v1',
    role,
    timestamp,
    method,
    path,
  ].join('\\n');
  const signature = createHmac('sha256', Buffer.from(keyBase64Url, 'base64url'))
    .update(message)
    .digest('base64url');
  return {
    'X-CPM-Admin-Role': role,
    'X-CPM-Admin-Timestamp': timestamp,
    'X-CPM-Admin-Signature': signature,
    ...extra,
  };
}

async function inspectPositiveJourneys(baseUrl, credentials) {
  const missing = Object.entries(credentials)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    return { status: 'failed', error: 'missing_service_identity_credentials', missing };
  }
  const reviewerDashboardPath = '/admin/api/dashboard';
  const publicationPath = '/admin/api/export-activate';
  const reviewerDashboard = await requestSummary(
    baseUrl,
    reviewerDashboardPath,
    'GET',
    serviceHeaders('reviewer', credentials.reviewerKeyBase64Url, reviewerDashboardPath, 'GET'),
  );
  const reviewerPublication = await requestSummary(
    baseUrl,
    publicationPath,
    'POST',
    serviceHeaders('reviewer', credentials.reviewerKeyBase64Url, publicationPath, 'POST', {
      'Content-Type': 'application/json',
      'Idempotency-Key': '11111111-1111-4111-8111-111111111111',
    }),
  );
  const publisherDashboard = await requestSummary(
    baseUrl,
    reviewerDashboardPath,
    'GET',
    serviceHeaders('publisher', credentials.publisherKeyBase64Url, reviewerDashboardPath, 'GET'),
  );
  const publisherPublication = await requestSummary(
    baseUrl,
    publicationPath,
    'POST',
    serviceHeaders('publisher', credentials.publisherKeyBase64Url, publicationPath, 'POST', {
      'Content-Type': 'application/json',
      'Idempotency-Key': '22222222-2222-4222-8222-222222222222',
    }),
  );
  const passed =
    reviewerDashboard.status === 200 &&
    reviewerDashboard.cacheControlSafe &&
    reviewerDashboard.noPrivateLeakage &&
    reviewerPublication.status === 403 &&
    reviewerPublication.cacheControlSafe &&
    publisherDashboard.status === 403 &&
    publisherDashboard.cacheControlSafe &&
    publisherPublication.status === 400 &&
    publisherPublication.cacheControlSafe &&
    publisherPublication.noPrivateLeakage;
  return {
    status: passed ? 'passed' : 'failed',
    reviewerDashboard,
    reviewerPublication,
    publisherDashboard,
    publisherPublication,
    identityDigests: {
      reviewer: boundedHash('staging-service:reviewer'),
      publisher: boundedHash('staging-service:publisher'),
    },
  };
}

export async function evaluateConfiguredStagingIdentityAdmin""",
)

replace_exact(
    "scripts/run-ops-p6-001e-configured-staging-identity-admin.ts",
    """  const controlPlane = await inspectControlPlane(
    input.cloudflareApiToken,
    input.cloudflareAccountId,
  );
""",
    """  const controlPlane = inspectControlPlane(input.credentials);
""",
)

replace_exact(
    "scripts/run-ops-p6-001e-configured-staging-identity-admin.ts",
    """    const clientId = headers.get('CF-Access-Client-Id');
""",
    """    const role = headers.get('X-CPM-Admin-Role');
""",
)
replace_exact(
    "scripts/run-ops-p6-001e-configured-staging-identity-admin.ts",
    """    if (!clientId || headers.has('Cf-Access-Authenticated-User-Email')) {
""",
    """    if (!role || headers.has('Cf-Access-Authenticated-User-Email')) {
""",
)
replace_exact(
    "scripts/run-ops-p6-001e-configured-staging-identity-admin.ts",
    "if (clientId === 'reviewer-client') {",
    "if (role === 'reviewer') {",
)
replace_exact(
    "scripts/run-ops-p6-001e-configured-staging-identity-admin.ts",
    "if (clientId === 'publisher-client') {",
    "if (role === 'publisher') {",
)

replace_exact(
    "scripts/run-ops-p6-001e-configured-staging-identity-admin.ts",
    """      cloudflareApiToken: 'token',
      cloudflareAccountId: 'account',
      credentials: {
        reviewerClientId: 'reviewer-client',
        reviewerClientSecret: 'reviewer-secret',
        publisherClientId: 'publisher-client',
        publisherClientSecret: 'publisher-secret',
      },
""",
    """      credentials: {
        reviewerKeyBase64Url: Buffer.alloc(32, 17).toString('base64url'),
        publisherKeyBase64Url: Buffer.alloc(32, 23).toString('base64url'),
      },
""",
)
replace_exact(
    "scripts/run-ops-p6-001e-configured-staging-identity-admin.ts",
    """      cloudflareApiToken: '',
      cloudflareAccountId: '',
      credentials: {
        reviewerClientId: '',
        reviewerClientSecret: '',
        publisherClientId: '',
        publisherClientSecret: '',
      },
""",
    """      credentials: {
        reviewerKeyBase64Url: '',
        publisherKeyBase64Url: '',
      },
""",
)
replace_exact(
    "scripts/run-ops-p6-001e-configured-staging-identity-admin.ts",
    """    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN ?? '',
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    reviewBaseUrl: process.env.CPM_REVIEW_BASE_URL,
    credentials: {
      reviewerClientId: process.env.CPM_STAGING_ACCESS_REVIEWER_CLIENT_ID ?? '',
      reviewerClientSecret: process.env.CPM_STAGING_ACCESS_REVIEWER_CLIENT_SECRET ?? '',
      publisherClientId: process.env.CPM_STAGING_ACCESS_PUBLISHER_CLIENT_ID ?? '',
      publisherClientSecret: process.env.CPM_STAGING_ACCESS_PUBLISHER_CLIENT_SECRET ?? '',
    },
""",
    """    reviewBaseUrl: process.env.CPM_REVIEW_BASE_URL,
    credentials: {
      reviewerKeyBase64Url: process.env.CPM_STAGING_ADMIN_REVIEWER_HMAC_KEY_BASE64URL ?? '',
      publisherKeyBase64Url: process.env.CPM_STAGING_ADMIN_PUBLISHER_HMAC_KEY_BASE64URL ?? '',
    },
""",
)

for path in [
    "docs/ADMIN_ACCESS_CONFIGURATION.md",
    "docs/OPS_P6_001E_CONFIGURED_STAGING_P6_02_IDENTITY_ADMIN.md",
]:
    target = ROOT / path
    content = target.read_text(encoding="utf-8")
    content += """

## Configured staging derived service authentication

Configured staging may use `CPM_ADMIN_AUTH_MODE=derived_staging_service` when an external
Access control plane is not part of the bounded environment. Reviewer and publisher HMAC keys
are derived from the existing review seed with separate HKDF labels and synchronized only to the
Pages preview environment. Requests carry role, timestamp, and HMAC signature headers; signatures
are verified with WebCrypto, expire within a bounded clock window, and never rely on an unverified
email header. Production and the default mode remain Cloudflare Access with issuer, audience, and
signature validation. No raw key or request signature may be retained in logs, receipts, artifacts,
or repository files.
"""
    target.write_text(content, encoding="utf-8")

status_path = ROOT / "docs/PROJECT_STATUS.md"
status = status_path.read_text(encoding="utf-8")
status = (
    "OPS-P6-001F is implementing a staging-only derived service authentication boundary while "
    "retaining Cloudflare Access as the production/default mode. No production, DNS, canonical "
    "data, or public release activation is changed.\n\n" + status
)
status_path.write_text(status, encoding="utf-8")

print('OPS-P6-001F migration applied.')
