import { z } from 'zod';
import type { AdminAccessConfiguration } from './config';
import { parseVerifiedAdminAccessIdentity, type AdminAccessIdentity } from './identity';

const maximumAssertionLength = 16_384;

const jwtHeaderSchema = z
  .object({
    alg: z.literal('RS256'),
    kid: z.string().trim().min(1).max(256),
  })
  .passthrough();

const audienceValueSchema = z.string().min(1).max(512);
const jwtClaimsSchema = z
  .object({
    sub: z.string().trim().min(1).max(200),
    email: z.email().max(320).nullable().optional(),
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

export interface AdminAccessVerificationDependencies {
  fetch?: typeof globalThis.fetch;
  crypto?: Pick<Crypto, 'subtle'>;
  now?: () => number;
}

export class AdminAccessVerificationError extends Error {
  constructor(message = 'Cloudflare Access verification failed.') {
    super(message);
    this.name = 'AdminAccessVerificationError';
  }
}

function verificationError(message: string): AdminAccessVerificationError {
  return new AdminAccessVerificationError(message);
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
    const paddingLength = (4 - (normalized.length % 4)) % 4;
    const decoded = globalThis.atob(normalized.padEnd(normalized.length + paddingLength, '='));
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw verificationError('The Access assertion is not valid base64url data.');
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

export async function verifyAdminAccessRequest(
  request: Request,
  configuration: AdminAccessConfiguration,
  dependencies: AdminAccessVerificationDependencies = {},
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
