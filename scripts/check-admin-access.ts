import { createAdminAccessMiddleware } from '../functions/admin/_middleware';
import {
  AdminAccessConfigurationError,
  readAdminAccessConfiguration,
} from '../src/admin/access/config';
import { parseVerifiedAdminAccessIdentity } from '../src/admin/access/identity';

const configuration = readAdminAccessConfiguration({
  CF_ACCESS_TEAM_DOMAIN: 'https://runtime-team.cloudflareaccess.com',
  CF_ACCESS_AUD: 'b'.repeat(64),
});

if (
  configuration.domain !== 'https://runtime-team.cloudflareaccess.com' ||
  configuration.aud !== 'b'.repeat(64)
) {
  throw new Error('Administration Access configuration normalization failed.');
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
    verifierConfiguration.domain !== configuration.domain ||
    verifierConfiguration.aud !== configuration.aud
  ) {
    throw new Error('Access verifier received incorrect configuration.');
  }
  return identity;
});

const data: Record<string, unknown> = {};
const response = await middleware({
  request: new Request('https://cryptopaymap.example/admin'),
  env: {
    CF_ACCESS_TEAM_DOMAIN: configuration.domain,
    CF_ACCESS_AUD: configuration.aud,
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
    CF_ACCESS_TEAM_DOMAIN: configuration.domain,
    CF_ACCESS_AUD: configuration.aud,
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
