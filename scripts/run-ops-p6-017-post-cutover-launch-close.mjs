import { createHash } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { connect as tlsConnect } from 'node:tls';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const exactConfirmation = 'OBSERVE_AND_CLOSE_CONFIGURED_PRODUCTION_LAUNCH';
const evidenceId = 'P6-08-CLOSE';
const environment = 'configured_production';
const apexHost = 'cryptopaymap.com';
const canonicalHost = 'www.cryptopaymap.com';
const projectName = 'cryptopaymap-production';
const platformDomain = `${projectName}.pages.dev`;
const legacyA = '216.198.79.1';
const legacyVerificationTxt = '"google-site-verification=TbZusMHCz2uUVjaRZ920mzqaK1DTYYYk7KHSpUTCIJY"';
const legacyWwwCname = '02eeaa61ea1e3365.vercel-dns-017.com';
const paths = {
  goLive: 'config/production-authorization/go-live-receipt.json',
  media: 'config/staging-authorization/p6-04-r2-media-lifecycle-receipt.json',
  q2: 'config/staging-authorization/p6-07-monitoring-alert-receipt.json',
  q3: 'config/staging-authorization/p6-07-backup-integrity-receipt.json',
  q4: 'config/staging-authorization/p6-07-isolated-restore-receipt.json',
  q5: 'config/staging-authorization/p6-07-operations-recovery-receipt.json',
};

function digest(value) {
  const hash = createHash('sha256');
  hash.update(typeof value === 'string' || value instanceof Uint8Array ? value : JSON.stringify(value));
  return `sha256:${hash.digest('hex')}`;
}

function sha256(value) {
  return digest(value).slice('sha256:'.length);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readJson(path) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function validCommit(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
}

function validDigest(value) {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

function validOwner(value) {
  return typeof value === 'string' && value.trim().length >= 3 && value.trim().length <= 100;
}

function safeTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function strictInteger(value, minimum, maximum) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
}

function normalizeHostname(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\.$/, '') : null;
}

function safeException(error) {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/[^a-zA-Z0-9:_./-]/g, '_').slice(0, 200);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArrayInput(value, label) {
  try {
    const parsed = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) throw new Error('not_array');
    return parsed;
  } catch {
    throw new Error(`${label}:invalid_json_array`);
  }
}

function validateRegister(items, { allowLaunchBlocking = false } = {}) {
  return items.every((item) => {
    if (!isObject(item)) return false;
    if (typeof item.id !== 'string' || item.id.length < 1 || item.id.length > 120) return false;
    if (typeof item.owner !== 'string' || item.owner.length < 3 || item.owner.length > 100) return false;
    if (safeTimestamp(item.deadline) === null) return false;
    if (!allowLaunchBlocking && item.launchBlocking === true) return false;
    return true;
  });
}

function evidenceReceipt(statusRoot, path, id, commit, now, extra) {
  const receipt = readJson(resolve(statusRoot, path));
  const expiresAt = safeTimestamp(receipt?.expiresAt);
  const current =
    receipt?.version === 1 &&
    receipt?.evidenceId === id &&
    receipt?.environment === 'configured_staging' &&
    receipt?.state === 'accepted' &&
    receipt?.commit === commit &&
    expiresAt !== null &&
    Date.parse(expiresAt) > now.getTime() &&
    Array.isArray(receipt?.exceptions) &&
    receipt.exceptions.length === 0 &&
    extra(receipt);
  return {
    path,
    state: current ? 'current' : receipt === null ? 'missing' : 'stale_or_failed',
    generatedAt: safeTimestamp(receipt?.generatedAt),
    expiresAt,
    digest: current ? digest(JSON.stringify(receipt)) : null,
    receipt: current ? receipt : null,
  };
}

export function evaluateOperationalEvidence(statusRoot, commit, now = new Date()) {
  const media = evidenceReceipt(statusRoot, paths.media, 'P6-04', commit, now, (receipt) =>
    [
      receipt?.checks?.uploadAuthorization?.status,
      receipt?.checks?.byteInspection?.status,
      receipt?.checks?.privateOriginal?.status,
      receipt?.checks?.partialFailure?.status,
      receipt?.checks?.approval?.status,
      receipt?.checks?.replayAndCapability?.status,
      receipt?.checks?.publicDelivery?.status,
      receipt?.checks?.takedown?.status,
      receipt?.checks?.cleanup?.status,
    ].every((value) => value === 'passed'),
  );
  const q2 = evidenceReceipt(statusRoot, paths.q2, 'P6-07-Q2', commit, now, (receipt) =>
    receipt?.checks?.liveMonitoring?.status === 'passed' &&
    receipt?.checks?.liveMonitoring?.heartbeat?.status === 'healthy' &&
    receipt?.checks?.alertExercise?.status === 'passed' &&
    receipt?.checks?.incidentReporting?.status === 'passed' &&
    receipt?.checks?.externalReverification?.status === 'passed',
  );
  const q3 = evidenceReceipt(statusRoot, paths.q3, 'P6-07-Q3', commit, now, (receipt) =>
    receipt?.checks?.backup?.status === 'passed' &&
    receipt?.checks?.backup?.inventory?.status === 'passed' &&
    receipt?.checks?.backup?.encryption?.status === 'passed' &&
    receipt?.checks?.backup?.retention?.status === 'passed' &&
    receipt?.checks?.backup?.integrity?.status === 'passed',
  );
  const q4 = evidenceReceipt(statusRoot, paths.q4, 'P6-07-Q4', commit, now, (receipt) =>
    receipt?.checks?.restore?.status === 'passed' &&
    receipt?.checks?.reconciliation?.status === 'passed' &&
    receipt?.checks?.objectives?.rpo?.status === 'passed' &&
    receipt?.checks?.objectives?.rto?.status === 'passed' &&
    receipt?.checks?.disposal?.status === 'passed' &&
    receipt?.checks?.disposal?.remainingUserObjectCount === 0,
  );
  const q5 = evidenceReceipt(statusRoot, paths.q5, 'P6-07-Q5', commit, now, (receipt) =>
    receipt?.decision === 'accepted' &&
    receipt?.checks?.scenario?.status === 'passed' &&
    receipt?.checks?.incident?.status === 'passed' &&
    receipt?.checks?.externalReverification?.status === 'passed' &&
    receipt?.checks?.finalReceipt?.status === 'passed',
  );
  return { media, q2, q3, q4, q5 };
}

function readGoLive(statusRoot, commit) {
  const receipt = readJson(resolve(statusRoot, paths.goLive));
  const accepted =
    receipt?.version === 1 &&
    receipt?.evidenceId === 'P6-08-GO-LIVE' &&
    receipt?.environment === environment &&
    receipt?.state === 'accepted' &&
    receipt?.commit === commit &&
    isObject(receipt?.evidenceBinding) &&
    validDigest(receipt?.evidenceBinding?.releaseAuthorityDigest) &&
    validDigest(receipt?.evidenceBinding?.candidateArtifactId) &&
    typeof receipt?.evidenceBinding?.publicTreeDigest === 'string' &&
    /^[a-f0-9]{64}$/.test(receipt.evidenceBinding.publicTreeDigest) &&
    typeof receipt?.evidenceBinding?.datasetVersion === 'string' &&
    typeof receipt?.evidenceBinding?.schemaVersion === 'string' &&
    receipt?.checks?.preState?.status === 'passed' &&
    receipt?.checks?.candidateCutover?.status === 'passed' &&
    receipt?.checks?.candidateExternal?.status === 'passed' &&
    receipt?.checks?.rollback?.status === 'passed' &&
    receipt?.checks?.rollbackExternal?.status === 'passed' &&
    receipt?.checks?.finalRestore?.status === 'passed' &&
    receipt?.checks?.finalExternal?.status === 'passed' &&
    receipt?.checks?.apexMutation === false &&
    receipt?.checks?.unrelatedDnsMutation === false &&
    receipt?.checks?.stagingMutation === false &&
    receipt?.checks?.launchClosed === false &&
    Array.isArray(receipt?.blockers) &&
    receipt.blockers.length === 0 &&
    Array.isArray(receipt?.exceptions) &&
    receipt.exceptions.length === 0;
  return {
    path: paths.goLive,
    state: accepted ? 'accepted' : receipt === null ? 'missing' : 'not_accepted',
    generatedAt: safeTimestamp(receipt?.generatedAt),
    completedAt: safeTimestamp(receipt?.completedAt),
    digest: accepted ? digest(JSON.stringify(receipt)) : null,
    binding: accepted ? receipt.evidenceBinding : null,
    receipt: accepted ? receipt : null,
  };
}

class CloudflareApiError extends Error {
  constructor(label, status) {
    super(`${label}:${status}`);
    this.name = 'CloudflareApiError';
    this.status = status;
  }
}

async function cloudflareRequest(path) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('cloudflare_token_missing');
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) throw new CloudflareApiError('cloudflare_get_failed', response.status);
  return payload.result;
}

async function providerObservation() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error('cloudflare_account_missing');
  const zones = await cloudflareRequest(`/zones?account.id=${encodeURIComponent(accountId)}&name=${encodeURIComponent(apexHost)}&status=active&per_page=50`);
  const exactZones = Array.isArray(zones) ? zones.filter((zone) => zone?.name === apexHost && zone?.status === 'active') : [];
  if (exactZones.length !== 1) throw new Error(`active_zone_count:${exactZones.length}`);
  const zone = exactZones[0];
  const records = await cloudflareRequest(`/zones/${encodeURIComponent(zone.id)}/dns_records?per_page=100`);
  const apexRecords = Array.isArray(records) ? records.filter((record) => normalizeHostname(record?.name) === apexHost) : [];
  const wwwRecords = Array.isArray(records) ? records.filter((record) => normalizeHostname(record?.name) === canonicalHost) : [];
  const project = await cloudflareRequest(`/accounts/${encodeURIComponent(accountId)}/pages/projects/${projectName}`);
  const domains = await cloudflareRequest(`/accounts/${encodeURIComponent(accountId)}/pages/projects/${projectName}/domains`);
  const customDomains = Array.isArray(domains) ? domains : [];

  const apexA = apexRecords.filter((record) => record?.type === 'A' && record?.content === legacyA && record?.proxied === false && record?.ttl === 1);
  const apexTxt = apexRecords.filter((record) => record?.type === 'TXT' && record?.content === legacyVerificationTxt && record?.proxied === false && record?.ttl === 3600);
  const wwwCandidate = wwwRecords.filter(
    (record) =>
      record?.type === 'CNAME' &&
      normalizeHostname(record?.content) === platformDomain &&
      record?.proxied === true &&
      record?.ttl === 1,
  );
  const legacyWww = wwwRecords.filter(
    (record) => record?.type === 'CNAME' && normalizeHostname(record?.content) === legacyWwwCname,
  );
  const wwwDomains = customDomains.filter((domain) => normalizeHostname(domain?.name) === canonicalHost);
  const safe =
    apexRecords.length === 2 &&
    apexA.length === 1 &&
    apexTxt.length === 1 &&
    wwwRecords.length === 1 &&
    wwwCandidate.length === 1 &&
    legacyWww.length === 0 &&
    project?.name === projectName &&
    project?.production_branch === 'main' &&
    normalizeHostname(project?.subdomain) === platformDomain &&
    customDomains.length === 1 &&
    wwwDomains.length === 1 &&
    wwwDomains[0]?.status === 'active';
  if (!safe) throw new Error('provider_topology_not_final_candidate');
  return {
    status: 'passed',
    zoneIdDigest: digest(zone.id),
    projectIdDigest: typeof project?.id === 'string' ? digest(project.id) : null,
    apexRecordDigest: digest(
      apexRecords.map((record) => ({ type: record.type, name: record.name, content: record.content, proxied: record.proxied, ttl: record.ttl })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ),
    wwwRecordDigest: digest(
      wwwRecords.map((record) => ({ type: record.type, name: record.name, content: record.content, proxied: record.proxied, ttl: record.ttl })),
    ),
    customDomainStatus: 'active',
  };
}

function tlsObservation(hostname) {
  return new Promise((resolvePromise, reject) => {
    const socket = tlsConnect(
      { host: hostname, port: 443, servername: hostname, rejectUnauthorized: true, timeout: 15_000 },
      () => {
        try {
          const certificate = socket.getPeerCertificate();
          const protocol = socket.getProtocol();
          const validTo = safeTimestamp(certificate?.valid_to);
          const altNames = String(certificate?.subjectaltname ?? '').split(/,\s*/).map((value) => value.replace(/^DNS:/, '').toLowerCase());
          if (!socket.authorized) throw new Error('tls_not_authorized');
          if (!['TLSv1.2', 'TLSv1.3'].includes(protocol)) throw new Error(`tls_protocol:${protocol}`);
          if (validTo === null || Date.parse(validTo) <= Date.now() + 7 * 24 * 60 * 60_000) throw new Error('tls_expiry_too_close');
          if (!altNames.includes(hostname) && !altNames.includes(`*.${hostname.split('.').slice(1).join('.')}`)) throw new Error('tls_hostname_not_covered');
          resolvePromise({ status: 'passed', protocol, validTo, certificateDigest: digest(certificate.raw ?? certificate.fingerprint256 ?? '') });
        } catch (error) {
          reject(error);
        } finally {
          socket.end();
        }
      },
    );
    socket.once('timeout', () => socket.destroy(new Error('tls_timeout')));
    socket.once('error', reject);
  });
}

async function fetchBytes(path, expectedStatus, expectedTypes) {
  const response = await fetch(`https://${canonicalHost}${path}?p6_017=${Date.now()}-${Math.random()}`, {
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get('content-type')?.split(';')[0] ?? null;
  if (response.status !== expectedStatus) throw new Error(`route_status:${path}:${response.status}`);
  if (!expectedTypes.includes(contentType)) throw new Error(`route_type:${path}:${contentType}`);
  return { response, bytes, contentType, text: new TextDecoder().decode(bytes) };
}

async function apexRedirectObservation() {
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `/p6-017-observe/${nonce}`;
  const query = `preserve=1&sample=${nonce}`;
  const response = await fetch(`https://${apexHost}${path}?${query}`, {
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  const expected = `https://${canonicalHost}${path}?${query}`;
  if (response.status !== 307 || response.headers.get('location') !== expected) throw new Error('apex_redirect_contract_failed');
  if ((response.headers.get('server') ?? '').toLowerCase() !== 'vercel') throw new Error('apex_redirect_provider_changed');
  return { status: 307, locationDigest: digest(expected), provider: 'vercel' };
}

function countPayload(path, value) {
  if (path.endsWith('/stats.json')) return isObject(value?.stats) ? 1 : null;
  return Array.isArray(value?.records) ? value.records.length : null;
}

async function verifyMachineSurface(binding) {
  const versionResult = await fetchBytes('/version.json', 200, ['application/json']);
  const manifestResult = await fetchBytes('/data/manifest.json', 200, ['application/json']);
  const version = JSON.parse(versionResult.text);
  const manifest = JSON.parse(manifestResult.text);
  if (
    version?.datasetVersion !== binding.datasetVersion ||
    version?.schemaVersion !== binding.schemaVersion ||
    version?.canonicalOnly !== true ||
    manifest?.datasetVersion !== binding.datasetVersion ||
    manifest?.schemaVersion !== binding.schemaVersion ||
    manifest?.canonicalOnly !== true ||
    !Array.isArray(manifest?.files)
  ) {
    throw new Error('machine_identity_mismatch');
  }
  const generatedAt = safeTimestamp(manifest.generatedAt);
  if (generatedAt === null || Date.now() - Date.parse(generatedAt) > 30 * 24 * 60 * 60_000) throw new Error('canonical_data_too_stale');

  let totalRecords = 0;
  const dataChecks = [];
  for (const file of manifest.files) {
    if (!isObject(file) || typeof file.path !== 'string' || typeof file.sha256 !== 'string' || !Number.isInteger(file.recordCount)) throw new Error('manifest_file_invalid');
    if (!file.path.startsWith('/data/') || file.path === '/data/manifest.json') throw new Error('manifest_file_scope_invalid');
    const result = await fetchBytes(file.path, 200, ['application/json']);
    if (sha256(result.bytes) !== file.sha256) throw new Error(`data_digest_mismatch:${file.path}`);
    const value = JSON.parse(result.text);
    const count = countPayload(file.path, value);
    if (count !== file.recordCount) throw new Error(`data_record_count_mismatch:${file.path}`);
    totalRecords += count;
    dataChecks.push({ path: file.path, recordCount: count, digest: digest(result.bytes) });
  }

  const llms = await fetchBytes('/llms.txt', 200, ['text/plain']);
  if (!/cryptopaymap/i.test(llms.text) || !llms.text.includes(`https://${canonicalHost}/`) || !llms.text.includes('/data/manifest.json')) throw new Error('llms_surface_invalid');
  const ai = await fetchBytes('/ai.txt', 200, ['text/plain']);
  if (!/cryptopaymap/i.test(ai.text) || !/canonical[-_ ]only/i.test(ai.text) || !ai.text.includes('/data/manifest.json')) throw new Error('ai_surface_invalid');
  const robots = await fetchBytes('/robots.txt', 200, ['text/plain']);
  if (!robots.text.includes('User-agent: *') || !robots.text.includes('Allow: /') || robots.text.includes('Disallow: /') || !robots.text.includes(`Sitemap: https://${canonicalHost}/sitemap.xml`)) throw new Error('robots_surface_invalid');
  const sitemap = await fetchBytes('/sitemap.xml', 200, ['application/xml', 'text/xml']);
  if (!sitemap.text.includes(`https://${canonicalHost}/`) || sitemap.text.includes('/admin/')) throw new Error('sitemap_surface_invalid');

  return {
    status: 'passed',
    datasetVersion: binding.datasetVersion,
    schemaVersion: binding.schemaVersion,
    generatedAt,
    totalRecords,
    dataDigest: digest(dataChecks),
    versionDigest: digest(versionResult.bytes),
    manifestDigest: digest(manifestResult.bytes),
    llmsDigest: digest(llms.bytes),
    aiDigest: digest(ai.bytes),
    robotsDigest: digest(robots.bytes),
    sitemapDigest: digest(sitemap.bytes),
  };
}

async function externalSample(binding) {
  const provider = await providerObservation();
  const apex = await apexRedirectObservation();
  const apexAddresses = (await dns.resolve4(apexHost)).sort();
  if (!apexAddresses.includes(legacyA)) throw new Error('apex_public_dns_changed');
  let legacyCnames = [];
  try {
    legacyCnames = (await dns.resolveCname(canonicalHost)).map(normalizeHostname);
  } catch {}
  if (legacyCnames.includes(legacyWwwCname)) throw new Error('split_target_legacy_cname_visible');
  const wwwAddresses = (await dns.resolve4(canonicalHost)).sort();
  if (wwwAddresses.length === 0) throw new Error('canonical_public_dns_missing');
  const tls = await tlsObservation(canonicalHost);

  const publicRoutes = [];
  for (const path of ['/', '/places/', '/online/']) {
    const result = await fetchBytes(path, 200, ['text/html']);
    publicRoutes.push({ path, digest: digest(result.bytes), contentType: result.contentType });
  }
  const markerResult = await fetchBytes('/p6-05-release.json', 200, ['application/json']);
  const marker = JSON.parse(markerResult.text);
  if (
    digest(marker?.releaseId ?? '') !== binding.releaseAuthorityDigest ||
    marker?.candidateArtifactId !== binding.candidateArtifactId ||
    marker?.publicTreeDigest !== binding.publicTreeDigest
  ) {
    throw new Error('release_identity_mismatch');
  }

  const admin = await fetchBytes('/admin/', 403, ['text/plain']);
  if (
    admin.response.headers.get('cache-control') !== 'private, no-store' ||
    admin.response.headers.get('x-robots-tag') !== 'noindex, nofollow, noarchive' ||
    admin.response.headers.get('x-content-type-options') !== 'nosniff'
  ) {
    throw new Error('admin_fail_closed_headers_invalid');
  }

  const machine = await verifyMachineSurface(binding);
  const identity = {
    releaseAuthorityDigest: binding.releaseAuthorityDigest,
    candidateArtifactId: binding.candidateArtifactId,
    publicTreeDigest: binding.publicTreeDigest,
    datasetVersion: binding.datasetVersion,
    schemaVersion: binding.schemaVersion,
  };
  return {
    observedAt: new Date().toISOString(),
    status: 'passed',
    identity,
    identityDigest: digest(identity),
    provider,
    recursiveDnsDigest: digest({ apexAddresses, wwwAddresses, legacyCnames }),
    tls,
    apex,
    routeDigest: digest(publicRoutes),
    routeCount: publicRoutes.length,
    markerDigest: digest(markerResult.bytes),
    admin: { status: 403, headers: 'passed' },
    machine,
  };
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function boundedRegisters(risks, deferred, incidents) {
  return {
    openRiskRegister: risks.map((item) => ({ id: item.id, ownerDigest: digest(item.owner), deadline: item.deadline, launchBlocking: item.launchBlocking === true })),
    deferredItems: deferred.map((item) => ({ id: item.id, ownerDigest: digest(item.owner), deadline: item.deadline, launchBlocking: item.launchBlocking === true })),
    incidentLinks: incidents.map((item) => ({ issueNumber: item.issueNumber, state: item.state })),
  };
}

export function closeDecision({ commit, goLive, operational, samples, observationMinutes, intervalMinutes, risks, deferred, incidents, nextReviewDate, closeOwner, repositoryContractOutcome }) {
  const blockers = [];
  if (!validCommit(commit)) blockers.push('approved_commit:invalid');
  if (goLive.state !== 'accepted') blockers.push('go_live:not_accepted');
  for (const [key, value] of Object.entries(operational)) if (value.state !== 'current') blockers.push(`${key}:not_current`);
  if (repositoryContractOutcome !== 'success') blockers.push('repository_contract:failed');
  if (!validOwner(closeOwner)) blockers.push('close_owner:invalid');
  if (!Number.isInteger(observationMinutes) || observationMinutes < 15 || observationMinutes > 120) blockers.push('observation_window:invalid');
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 15 || intervalMinutes > observationMinutes) blockers.push('sample_interval:invalid');
  const requiredSamples = Number.isInteger(observationMinutes) && Number.isInteger(intervalMinutes) ? Math.max(3, Math.floor(observationMinutes / intervalMinutes) + 1) : 3;
  if (!Array.isArray(samples) || samples.length < requiredSamples) blockers.push('observation_samples:insufficient');
  if (Array.isArray(samples) && samples.some((sample) => sample?.status !== 'passed')) blockers.push('observation_samples:failed');
  const identities = Array.isArray(samples) ? new Set(samples.filter((sample) => sample?.status === 'passed').map((sample) => sample.identityDigest)) : new Set();
  if (identities.size !== 1) blockers.push('observation_identity:mixed');
  if (!validateRegister(risks)) blockers.push('open_risk_register:invalid_or_blocking');
  if (!validateRegister(deferred)) blockers.push('deferred_items:invalid_or_blocking');
  if (!Array.isArray(incidents) || incidents.some((item) => !Number.isInteger(item?.issueNumber) || item.issueNumber < 1 || item.state !== 'closed')) blockers.push('incident_links:open_or_invalid');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextReviewDate ?? '') || !Number.isFinite(Date.parse(`${nextReviewDate}T00:00:00Z`))) blockers.push('next_review_date:invalid');
  return { state: [...new Set(blockers)].length === 0 ? 'closed' : 'verification_failed', blockers: [...new Set(blockers)] };
}

async function execute(statusRoot, incidentPath, outputPath) {
  const start = new Date();
  const commit = process.env.APPROVED_COMMIT ?? '';
  const confirmation = process.env.CONFIRMATION ?? '';
  const closeOwner = process.env.CLOSE_OWNER ?? '';
  const repositoryContractOutcome = process.env.REPOSITORY_CONTRACT_OUTCOME ?? 'failed';
  const observationMinutes = strictInteger(process.env.OBSERVATION_MINUTES, 15, 120);
  const intervalMinutes = strictInteger(process.env.SAMPLE_INTERVAL_MINUTES, 1, 15);
  const nextReviewDate = process.env.NEXT_OPERATIONAL_REVIEW_DATE ?? '';
  const risks = parseArrayInput(process.env.OPEN_RISK_REGISTER_JSON ?? '[]', 'open_risk_register');
  const deferred = parseArrayInput(process.env.DEFERRED_ITEMS_JSON ?? '[]', 'deferred_items');
  const incidents = readJson(incidentPath)?.incidents ?? [];
  const goLive = readGoLive(statusRoot, commit);
  const operational = evaluateOperationalEvidence(statusRoot, commit, start);
  const initialBlockers = [];
  if (confirmation !== exactConfirmation) initialBlockers.push('confirmation:invalid');
  if (goLive.state !== 'accepted') initialBlockers.push('go_live:not_accepted');
  for (const [key, value] of Object.entries(operational)) if (value.state !== 'current') initialBlockers.push(`${key}:not_current`);
  if (repositoryContractOutcome !== 'success') initialBlockers.push('repository_contract:failed');
  if (!validOwner(closeOwner)) initialBlockers.push('close_owner:invalid');
  if (observationMinutes === null) initialBlockers.push('observation_window:invalid');
  if (intervalMinutes === null || (observationMinutes !== null && intervalMinutes > observationMinutes)) initialBlockers.push('sample_interval:invalid');
  if (!validateRegister(risks)) initialBlockers.push('open_risk_register:invalid_or_blocking');
  if (!validateRegister(deferred)) initialBlockers.push('deferred_items:invalid_or_blocking');
  if (!Array.isArray(incidents) || incidents.some((item) => !Number.isInteger(item?.issueNumber) || item.state !== 'closed')) initialBlockers.push('incident_links:open_or_invalid');

  const samples = [];
  if (initialBlockers.length === 0) {
    const endAt = start.getTime() + observationMinutes * 60_000;
    while (true) {
      try {
        samples.push(await externalSample(goLive.binding));
      } catch (error) {
        samples.push({ observedAt: new Date().toISOString(), status: 'failed', exception: safeException(error) });
      }
      if (Date.now() >= endAt) break;
      const remaining = endAt - Date.now();
      await sleep(Math.min(intervalMinutes * 60_000, remaining));
    }
  }

  const end = new Date();
  const finalOperational = evaluateOperationalEvidence(statusRoot, commit, end);
  const decision = closeDecision({
    commit,
    goLive,
    operational: finalOperational,
    samples,
    observationMinutes,
    intervalMinutes,
    risks,
    deferred,
    incidents,
    nextReviewDate,
    closeOwner,
    repositoryContractOutcome,
  });
  decision.blockers.unshift(...initialBlockers);
  decision.blockers = [...new Set(decision.blockers)];
  if (decision.blockers.length > 0) decision.state = 'verification_failed';
  const registers = boundedRegisters(risks, deferred, incidents);
  const evidenceIndex = {
    goLive: { path: goLive.path, state: goLive.state, digest: goLive.digest },
    ...Object.fromEntries(Object.entries(finalOperational).map(([key, value]) => [key, { path: value.path, state: value.state, digest: value.digest, expiresAt: value.expiresAt }])),
  };
  const closeId = digest({
    commit,
    goLiveDigest: goLive.digest,
    evidenceIndex,
    sampleDigest: digest(samples),
    observationStart: start.toISOString(),
    observationEnd: end.toISOString(),
    nextReviewDate,
  });
  const receipt = {
    version: 1,
    evidenceId,
    state: decision.state,
    environment,
    commit: validCommit(commit) ? commit : null,
    closeId,
    generatedAt: end.toISOString(),
    closeOwnerDigest: validOwner(closeOwner) ? digest(closeOwner) : null,
    binding: goLive.binding,
    observation: {
      start: start.toISOString(),
      end: end.toISOString(),
      requestedMinutes: observationMinutes,
      intervalMinutes,
      sampleCount: samples.length,
      sampleDigest: digest(samples),
      allPassed: samples.length > 0 && samples.every((sample) => sample.status === 'passed'),
      identityStable: new Set(samples.filter((sample) => sample.status === 'passed').map((sample) => sample.identityDigest)).size === 1,
    },
    checks: {
      repositoryContract: repositoryContractOutcome === 'success' ? 'passed' : 'failed',
      goLive: goLive.state,
      operationalEvidence: Object.fromEntries(Object.entries(finalOperational).map(([key, value]) => [key, value.state])),
      rollbackStatus: goLive.receipt?.checks?.rollback?.status ?? null,
      finalRestoreStatus: goLive.receipt?.checks?.finalRestore?.status ?? null,
      productionMutation: false,
      launchCloseMutation: false,
    },
    evidenceIndex,
    samples,
    ...registers,
    nextOperationalReviewDate: nextReviewDate,
    blockers: decision.blockers,
  };
  writeJson(outputPath, receipt);
  return receipt;
}

function fixtureReceipt(root, path, receipt) {
  writeJson(resolve(root, path), receipt);
}

function selfTest() {
  const root = mkdtempSync(resolve(tmpdir(), 'cpm-p6-017-'));
  try {
    const commit = 'a'.repeat(40);
    const now = new Date('2026-08-12T00:00:00Z');
    const expiry = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
    const base = { version: 1, environment: 'configured_staging', state: 'accepted', commit, generatedAt: now.toISOString(), expiresAt: expiry, exceptions: [] };
    fixtureReceipt(root, paths.media, { ...base, evidenceId: 'P6-04', checks: { uploadAuthorization: { status: 'passed' }, byteInspection: { status: 'passed' }, privateOriginal: { status: 'passed' }, partialFailure: { status: 'passed' }, approval: { status: 'passed' }, replayAndCapability: { status: 'passed' }, publicDelivery: { status: 'passed' }, takedown: { status: 'passed' }, cleanup: { status: 'passed' } } });
    fixtureReceipt(root, paths.q2, { ...base, evidenceId: 'P6-07-Q2', checks: { liveMonitoring: { status: 'passed', heartbeat: { status: 'healthy' } }, alertExercise: { status: 'passed' }, incidentReporting: { status: 'passed' }, externalReverification: { status: 'passed' } } });
    fixtureReceipt(root, paths.q3, { ...base, evidenceId: 'P6-07-Q3', checks: { backup: { status: 'passed', inventory: { status: 'passed' }, encryption: { status: 'passed' }, retention: { status: 'passed' }, integrity: { status: 'passed' } } } });
    fixtureReceipt(root, paths.q4, { ...base, evidenceId: 'P6-07-Q4', checks: { restore: { status: 'passed' }, reconciliation: { status: 'passed' }, objectives: { rpo: { status: 'passed' }, rto: { status: 'passed' } }, disposal: { status: 'passed', remainingUserObjectCount: 0 } } });
    fixtureReceipt(root, paths.q5, { ...base, evidenceId: 'P6-07-Q5', decision: 'accepted', checks: { scenario: { status: 'passed' }, incident: { status: 'passed' }, externalReverification: { status: 'passed' }, finalReceipt: { status: 'passed' } } });
    const operational = evaluateOperationalEvidence(root, commit, now);
    if (Object.values(operational).some((value) => value.state !== 'current')) throw new Error('self_test_failed:operational_evidence');
    const goLive = { state: 'accepted' };
    const samples = [1, 2, 3, 4].map((index) => ({ status: 'passed', identityDigest: digest('identity'), observedAt: new Date(now.getTime() + index * 5 * 60_000).toISOString() }));
    let decision = closeDecision({ commit, goLive, operational, samples, observationMinutes: 15, intervalMinutes: 5, risks: [], deferred: [], incidents: [], nextReviewDate: '2026-08-20', closeOwner: 'launch-close-owner', repositoryContractOutcome: 'success' });
    if (decision.state !== 'closed') throw new Error(`self_test_failed:expected_close:${decision.blockers.join(',')}`);
    const mixed = structuredClone(samples);
    mixed[2].identityDigest = digest('other');
    decision = closeDecision({ commit, goLive, operational, samples: mixed, observationMinutes: 15, intervalMinutes: 5, risks: [], deferred: [], incidents: [], nextReviewDate: '2026-08-20', closeOwner: 'launch-close-owner', repositoryContractOutcome: 'success' });
    if (!decision.blockers.includes('observation_identity:mixed')) throw new Error('self_test_failed:mixed_identity_not_rejected');
    decision = closeDecision({ commit, goLive, operational, samples, observationMinutes: 15, intervalMinutes: 5, risks: [{ id: 'risk', owner: 'owner', deadline: '2026-08-21T00:00:00Z', launchBlocking: true }], deferred: [], incidents: [], nextReviewDate: '2026-08-20', closeOwner: 'launch-close-owner', repositoryContractOutcome: 'success' });
    if (!decision.blockers.includes('open_risk_register:invalid_or_blocking')) throw new Error('self_test_failed:blocking_risk_not_rejected');
    console.log('OPS-P6-017 post-cutover launch-close evaluator self-test passed.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const [statusRoot, incidentPath, outputPath] = process.argv.slice(2);
  if (!statusRoot || !incidentPath || !outputPath) throw new Error('Usage: post-cutover-close <status-root> <incident-json> <output-path>');
  const receipt = await execute(statusRoot, incidentPath, outputPath);
  console.log(`Production launch-close state: ${receipt.state}`);
  if (receipt.state !== 'closed') process.exitCode = 1;
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) await main();
