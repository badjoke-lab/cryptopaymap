import { createAdminAccessMiddleware } from '../functions/admin/_middleware';
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
