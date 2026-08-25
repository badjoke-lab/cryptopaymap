import { createAdminAccessMiddleware } from '../functions/admin/_middleware';
import {
  AdminAccessConfigurationError,
  readAdminAccessConfiguration,
} from '../src/admin/access/config';
import { parseVerifiedAdminAccessIdentity } from '../src/admin/access/identity';
import {
  OWNER_SESSION_COOKIE_NAME,
  issueOwnerSession,
  verifyOwnerLoginSecret,
  verifyOwnerSession,
} from '../src/admin/access/owner-session';

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

const ownerSecret = 'C'.repeat(43);
const ownerSubject = 'primary-owner';
const ownerConfiguration = readAdminAccessConfiguration({
  CPM_ADMIN_AUTH_MODE: 'owner_session',
  CPM_ADMIN_OWNER_SECRET_BASE64URL: ownerSecret,
  CPM_ADMIN_OWNER_SUBJECT: ownerSubject,
  CPM_ADMIN_OWNER_SESSION_TTL_SECONDS: '1800',
});
if (
  ownerConfiguration.mode !== 'owner_session' ||
  ownerConfiguration.ownerSecretBase64Url !== ownerSecret ||
  ownerConfiguration.ownerSubject !== ownerSubject ||
  ownerConfiguration.sessionTtlSeconds !== 1800
) {
  throw new Error('Owner-session configuration normalization failed.');
}

if (!(await verifyOwnerLoginSecret(ownerSecret, ownerSecret))) {
  throw new Error('Owner login secret verification rejected the configured secret.');
}
if (await verifyOwnerLoginSecret('D'.repeat(43), ownerSecret)) {
  throw new Error('Owner login secret verification accepted a different secret.');
}

const ownerSession = await issueOwnerSession(ownerSecret, ownerSubject, 1800, 1_000);
const ownerPayload = await verifyOwnerSession(ownerSession, ownerSecret, ownerSubject, 1_100);
if (ownerPayload.sub !== ownerSubject || ownerPayload.iat !== 1_000 || ownerPayload.exp !== 2_800) {
  throw new Error('Owner session signing or verification failed.');
}

try {
  await verifyOwnerSession(ownerSession, ownerSecret, ownerSubject, 2_801);
  throw new Error('Expired owner session was accepted.');
} catch (error) {
  if (!(error instanceof Error) || error.message !== 'Invalid owner session payload.') throw error;
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

const ownerMiddleware = createAdminAccessMiddleware();
const ownerData: Record<string, unknown> = {};
const ownerResponse = await ownerMiddleware({
  request: new Request('https://cryptopaymap.example/admin', {
    headers: { Cookie: `${OWNER_SESSION_COOKIE_NAME}=${ownerSession}` },
  }),
  env: {
    CPM_ADMIN_AUTH_MODE: 'owner_session',
    CPM_ADMIN_OWNER_SECRET_BASE64URL: ownerSecret,
    CPM_ADMIN_OWNER_SUBJECT: ownerSubject,
    CPM_ADMIN_OWNER_SESSION_TTL_SECONDS: '1800',
  },
  params: {},
  data: ownerData,
  next: async () => new Response('owner-verified'),
  waitUntil: () => undefined,
});
const ownerIdentity = ownerData.adminIdentity as
  | { actorId?: string; actorType?: string; subject?: string }
  | undefined;
if (
  ownerResponse.status !== 200 ||
  (await ownerResponse.text()) !== 'owner-verified' ||
  ownerIdentity?.actorId !== `cryptopaymap-owner:${ownerSubject}` ||
  ownerIdentity.actorType !== 'human' ||
  ownerIdentity.subject !== ownerSubject
) {
  throw new Error('Owner-session middleware authentication failed.');
}

const loginEntryResponse = await ownerMiddleware({
  request: new Request('https://cryptopaymap.example/admin/login'),
  env: {
    CPM_ADMIN_AUTH_MODE: 'owner_session',
    CPM_ADMIN_OWNER_SECRET_BASE64URL: ownerSecret,
    CPM_ADMIN_OWNER_SUBJECT: ownerSubject,
  },
  params: {},
  data: {},
  next: async () => new Response('login-entry'),
  waitUntil: () => undefined,
});
if (loginEntryResponse.status !== 200 || (await loginEntryResponse.text()) !== 'login-entry') {
  throw new Error('Owner-session login entry was not reachable without a session cookie.');
}

const crossOriginMutation = await ownerMiddleware({
  request: new Request('https://cryptopaymap.example/admin/candidates/decision', {
    method: 'POST',
    headers: {
      Cookie: `${OWNER_SESSION_COOKIE_NAME}=${ownerSession}`,
      Origin: 'https://attacker.example',
    },
  }),
  env: {
    CPM_ADMIN_AUTH_MODE: 'owner_session',
    CPM_ADMIN_OWNER_SECRET_BASE64URL: ownerSecret,
    CPM_ADMIN_OWNER_SUBJECT: ownerSubject,
  },
  params: {},
  data: {},
  next: async () => new Response('must not be served'),
  waitUntil: () => undefined,
});
if (crossOriginMutation.status !== 403) {
  throw new Error('Cross-origin owner-session mutation did not fail closed.');
}

console.log('Administration Access checks passed.');
