import { createHash } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const exactConfirmation = 'EXECUTE_CONFIGURED_PRODUCTION_GO_LIVE';
const evidenceId = 'P6-08-GO-LIVE';
const environment = 'configured_production';
const projectName = 'cryptopaymap-production';
const stagingProjectName = 'cryptopaymap-staging';
const productionBranch = 'main';
const platformDomain = `${projectName}.pages.dev`;
const apexHost = 'cryptopaymap.com';
const canonicalHost = 'www.cryptopaymap.com';
const legacyA = '216.198.79.1';
const legacyWwwCname = '02eeaa61ea1e3365.vercel-dns-017.com';
const legacyVerificationTxt = '"google-site-verification=TbZusMHCz2uUVjaRZ920mzqaK1DTYYYk7KHSpUTCIJY"';
const authorizationPath = 'config/production-authorization/authorization-receipt.json';
const candidatePath = 'config/production-authorization/production-candidate-bootstrap-receipt.json';
const readinessPath = 'config/production-authorization/readiness-diagnostic.json';

function digest(value) {
  const hash = createHash('sha256');
  hash.update(typeof value === 'string' || value instanceof Uint8Array ? value : JSON.stringify(value));
  return `sha256:${hash.digest('hex')}`;
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

function publicRecordShape(record) {
  return {
    type: typeof record?.type === 'string' ? record.type : null,
    name: normalizeHostname(record?.name),
    content: typeof record?.content === 'string' ? record.content : null,
    proxied: record?.proxied === true,
    ttl: Number.isInteger(record?.ttl) ? record.ttl : null,
  };
}

function stableRecordDigest(records) {
  return digest(
    records
      .map(publicRecordShape)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}

function exactDnsRecord(record, { type, name, content, proxied, ttl }) {
  const shape = publicRecordShape(record);
  return (
    typeof record?.id === 'string' &&
    shape.type === type &&
    shape.name === normalizeHostname(name) &&
    normalizeHostname(shape.content) === normalizeHostname(content) &&
    shape.proxied === proxied &&
    shape.ttl === ttl
  );
}

function exactTxtRecord(record) {
  const shape = publicRecordShape(record);
  return (
    typeof record?.id === 'string' &&
    shape.type === 'TXT' &&
    shape.name === apexHost &&
    shape.content === legacyVerificationTxt &&
    shape.proxied === false &&
    shape.ttl === 3600
  );
}

export function classifyProviderSnapshot(snapshot) {
  if (!snapshot?.projectSafe || !snapshot?.zoneSafe || !snapshot?.stagingProjectSafe) return 'conflict';
  if (!Array.isArray(snapshot.apexRecords) || !Array.isArray(snapshot.wwwRecords)) return 'conflict';
  if (!Array.isArray(snapshot.customDomains) || !Array.isArray(snapshot.wwwDomains)) return 'conflict';

  const legacyARecords = snapshot.apexRecords.filter((record) =>
    exactDnsRecord(record, {
      type: 'A',
      name: apexHost,
      content: legacyA,
      proxied: false,
      ttl: 1,
    }),
  );
  const verificationRecords = snapshot.apexRecords.filter(exactTxtRecord);
  const apexExact =
    snapshot.apexRecords.length === 2 && legacyARecords.length === 1 && verificationRecords.length === 1;

  const legacyWww =
    snapshot.wwwRecords.length === 1 &&
    exactDnsRecord(snapshot.wwwRecords[0], {
      type: 'CNAME',
      name: canonicalHost,
      content: legacyWwwCname,
      proxied: false,
      ttl: 1,
    });
  const candidateWww =
    snapshot.wwwRecords.length === 1 &&
    exactDnsRecord(snapshot.wwwRecords[0], {
      type: 'CNAME',
      name: canonicalHost,
      content: platformDomain,
      proxied: true,
      ttl: 1,
    });

  const noCustomDomains = snapshot.customDomains.length === 0 && snapshot.wwwDomains.length === 0;
  const exactWwwDomain =
    snapshot.customDomains.length === 1 &&
    snapshot.wwwDomains.length === 1 &&
    normalizeHostname(snapshot.wwwDomains[0]?.name) === canonicalHost;

  if (apexExact && legacyWww && noCustomDomains) return 'legacy_v1';
  if (apexExact && candidateWww && exactWwwDomain) {
    return snapshot.wwwDomains[0]?.status === 'active' ? 'candidate_active' : 'candidate_pending';
  }
  return 'conflict';
}

function safeSnapshot(snapshot) {
  return {
    classification: classifyProviderSnapshot(snapshot),
    projectSafe: snapshot.projectSafe,
    zoneSafe: snapshot.zoneSafe,
    stagingProjectSafe: snapshot.stagingProjectSafe,
    apexRecordCount: snapshot.apexRecords.length,
    apexRecordDigest: stableRecordDigest(snapshot.apexRecords),
    wwwRecordCount: snapshot.wwwRecords.length,
    wwwRecordDigest: stableRecordDigest(snapshot.wwwRecords),
    customDomainCount: snapshot.customDomains.length,
    wwwDomainCount: snapshot.wwwDomains.length,
    wwwDomainStatuses: snapshot.wwwDomains
      .map((item) => (typeof item?.status === 'string' ? item.status : 'unknown'))
      .sort(),
    projectIdDigest: snapshot.projectIdDigest,
    zoneIdDigest: snapshot.zoneIdDigest,
    stagingProjectDigest: snapshot.stagingProjectDigest,
  };
}

function readEvidenceBundle(statusRoot, commit, expectedAuthorizationId, executionOwner, rollbackOwner, now) {
  const authorization = readJson(resolve(statusRoot, authorizationPath));
  const candidate = readJson(resolve(statusRoot, candidatePath));
  const readiness = readJson(resolve(statusRoot, readinessPath));
  const blockers = [];

  const authorizationExpires = safeTimestamp(authorization?.expiresAt);
  const candidateExpires = safeTimestamp(candidate?.expiresAt);
  const readinessExpires = safeTimestamp(readiness?.expiresAt);

  const authorizationCurrent =
    authorization?.version === 1 &&
    authorization?.state === 'authorized' &&
    authorization?.environment === 'configured_production' &&
    authorization?.mode === 'authorization' &&
    authorization?.approvedCommit === commit &&
    validDigest(authorization?.authorizationId) &&
    authorization.authorizationId === expectedAuthorizationId &&
    authorizationExpires !== null &&
    Date.parse(authorizationExpires) > now.getTime() &&
    authorization?.checks?.productionMutation === false &&
    authorization?.checks?.productionCandidateBootstrap?.state === 'current_accepted' &&
    authorization?.checks?.productionReadiness?.state === 'current_ready' &&
    isObject(authorization?.productionEvidenceBinding);
  if (!authorizationCurrent) blockers.push('production_authorization:not_current');

  const candidateCurrent =
    candidate?.version === 1 &&
    candidate?.evidenceId === 'P6-08-CANDIDATE' &&
    candidate?.state === 'accepted' &&
    candidate?.environment === 'configured_production_candidate' &&
    candidate?.commit === commit &&
    candidateExpires !== null &&
    Date.parse(candidateExpires) > now.getTime() &&
    validDigest(candidate?.releaseAuthorityDigest) &&
    validDigest(candidate?.candidateArtifactId) &&
    typeof candidate?.publicTreeDigest === 'string' &&
    /^[a-f0-9]{64}$/.test(candidate.publicTreeDigest) &&
    typeof candidate?.datasetVersion === 'string' &&
    candidate.datasetVersion.length > 0 &&
    typeof candidate?.schemaVersion === 'string' &&
    candidate.schemaVersion.length > 0 &&
    candidate?.checks?.projectTopology?.safe === true &&
    candidate?.checks?.deployment === 'passed' &&
    candidate?.checks?.externalVerification === 'passed' &&
    candidate?.checks?.liveDomainMutation === false &&
    candidate?.checks?.dnsMutation === false &&
    candidate?.checks?.canonicalHostMutation === false &&
    Array.isArray(candidate?.exceptions) &&
    candidate.exceptions.length === 0;
  if (!candidateCurrent) blockers.push('production_candidate:not_current');

  const readinessCurrent =
    readiness?.version === 1 &&
    readiness?.evidenceId === 'P6-08-READINESS' &&
    readiness?.state === 'diagnosed' &&
    readiness?.decision === 'ready' &&
    readiness?.environment === 'configured_production' &&
    readiness?.commit === commit &&
    readinessExpires !== null &&
    Date.parse(readinessExpires) > now.getTime() &&
    readiness?.checks?.productionMutation === false &&
    Array.isArray(readiness?.blockers) &&
    readiness.blockers.length === 0;
  if (!readinessCurrent) blockers.push('production_readiness:not_ready');

  const binding = authorization?.productionEvidenceBinding;
  if (authorizationCurrent && candidateCurrent) {
    if (binding?.candidateArtifactId !== candidate.candidateArtifactId)
      blockers.push('evidence_binding:candidate_artifact_mismatch');
    if (binding?.publicTreeDigest !== candidate.publicTreeDigest)
      blockers.push('evidence_binding:public_tree_mismatch');
    if (binding?.datasetVersion !== candidate.datasetVersion)
      blockers.push('evidence_binding:dataset_version_mismatch');
    if (binding?.schemaVersion !== candidate.schemaVersion)
      blockers.push('evidence_binding:schema_version_mismatch');
    if (binding?.releaseAuthorityDigest !== candidate.releaseAuthorityDigest)
      blockers.push('evidence_binding:release_authority_mismatch');
    if (binding?.candidateReceiptDigest !== digest(JSON.stringify(candidate)))
      blockers.push('evidence_binding:candidate_receipt_mismatch');
  }
  if (authorizationCurrent && readinessCurrent) {
    if (binding?.readinessReceiptDigest !== digest(JSON.stringify(readiness)))
      blockers.push('evidence_binding:readiness_receipt_mismatch');
  }

  if (!validOwner(executionOwner) || authorization?.operators?.launchOwner !== digest(executionOwner))
    blockers.push('execution_owner:not_authorized');
  if (!validOwner(rollbackOwner) || authorization?.operators?.rollbackOwner !== digest(rollbackOwner))
    blockers.push('rollback_owner:not_authorized');
  if (validOwner(executionOwner) && validOwner(rollbackOwner) && executionOwner === rollbackOwner)
    blockers.push('operator_separation:failed');

  return {
    authorization,
    candidate,
    readiness,
    authorizationExpires,
    candidateExpires,
    readinessExpires,
    blockers: [...new Set(blockers)],
  };
}

class CloudflareApiError extends Error {
  constructor(label, status, codes) {
    super(`${label}:${status}:${codes.length > 0 ? codes.join(',') : 'unknown'}`);
    this.name = 'CloudflareApiError';
    this.status = status;
    this.codes = codes;
  }
}

async function cloudflareRequest(path, label, { method = 'GET', body = undefined, allowNotFound = false } = {}) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('cloudflare_token_missing');
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {}
  if (allowNotFound && response.status === 404) return { found: false, result: null };
  if (!response.ok || payload?.success !== true) {
    const codes = Array.isArray(payload?.errors)
      ? payload.errors.map((item) => item?.code).filter((value) => Number.isInteger(value))
      : [];
    throw new CloudflareApiError(label, response.status, codes);
  }
  return { found: true, result: payload.result, resultInfo: payload.result_info ?? null };
}

async function listDnsRecords(zoneId) {
  const records = [];
  for (let page = 1; page <= 20; page += 1) {
    const { result, resultInfo } = await cloudflareRequest(
      `/zones/${encodeURIComponent(zoneId)}/dns_records?per_page=100&page=${page}`,
      'dns_records_list',
    );
    const batch = Array.isArray(result) ? result : [];
    records.push(...batch);
    const totalPages = Number(resultInfo?.total_pages ?? 1);
    if (page >= totalPages || batch.length === 0) break;
  }
  return records;
}

async function providerSnapshot() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error('cloudflare_account_missing');
  const [{ result: project }, { result: domains }, { result: zones }, { result: stagingProject }] =
    await Promise.all([
      cloudflareRequest(
        `/accounts/${encodeURIComponent(accountId)}/pages/projects/${projectName}`,
        'production_project_get',
      ),
      cloudflareRequest(
        `/accounts/${encodeURIComponent(accountId)}/pages/projects/${projectName}/domains`,
        'production_domains_list',
      ),
      cloudflareRequest(
        `/zones?account.id=${encodeURIComponent(accountId)}&name=${encodeURIComponent(apexHost)}&status=active&per_page=50`,
        'zone_lookup',
      ),
      cloudflareRequest(
        `/accounts/${encodeURIComponent(accountId)}/pages/projects/${stagingProjectName}`,
        'staging_project_get',
      ),
    ]);

  const exactZones = Array.isArray(zones)
    ? zones.filter((zone) => zone?.name === apexHost && zone?.status === 'active')
    : [];
  const zone = exactZones.length === 1 ? exactZones[0] : null;
  const records = zone?.id ? await listDnsRecords(zone.id) : [];
  const apexRecords = records.filter((record) => normalizeHostname(record?.name) === apexHost);
  const wwwRecords = records.filter((record) => normalizeHostname(record?.name) === canonicalHost);
  const allDomains = Array.isArray(domains) ? domains : [];
  const customDomains = allDomains.filter(
    (domain) => normalizeHostname(domain?.name) !== platformDomain,
  );
  const wwwDomains = customDomains.filter(
    (domain) => normalizeHostname(domain?.name) === canonicalHost,
  );
  const projectDomains = Array.isArray(project?.domains)
    ? project.domains.map(normalizeHostname).filter(Boolean)
    : [];
  const stagingDomains = Array.isArray(stagingProject?.domains)
    ? stagingProject.domains.map(normalizeHostname).filter(Boolean).sort()
    : [];

  return {
    projectSafe:
      project?.name === projectName &&
      project?.production_branch === productionBranch &&
      normalizeHostname(project?.subdomain) === platformDomain &&
      projectDomains.includes(platformDomain),
    zoneSafe: zone !== null && zone?.name === apexHost,
    stagingProjectSafe:
      stagingProject?.name === stagingProjectName &&
      stagingProject?.production_branch === 'staging-review' &&
      stagingDomains.includes('cryptopaymap-staging.pages.dev') &&
      stagingDomains.includes('staging.cryptopaymap.com'),
    projectIdDigest: typeof project?.id === 'string' ? digest(project.id) : null,
    zoneId: typeof zone?.id === 'string' ? zone.id : null,
    zoneIdDigest: typeof zone?.id === 'string' ? digest(zone.id) : null,
    stagingProjectDigest: digest({
      name: stagingProject?.name ?? null,
      productionBranch: stagingProject?.production_branch ?? null,
      subdomain: stagingProject?.subdomain ?? null,
      domains: stagingDomains,
    }),
    apexRecords,
    wwwRecords,
    customDomains,
    wwwDomains,
  };
}

async function deletePagesDomain() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  await cloudflareRequest(
    `/accounts/${encodeURIComponent(accountId)}/pages/projects/${projectName}/domains/${encodeURIComponent(canonicalHost)}`,
    'pages_domain_delete',
    { method: 'DELETE', allowNotFound: true },
  );
}

async function addPagesDomain() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  await cloudflareRequest(
    `/accounts/${encodeURIComponent(accountId)}/pages/projects/${projectName}/domains`,
    'pages_domain_add',
    { method: 'POST', body: { name: canonicalHost } },
  );
}

async function deleteExactRecord(zoneId, record, expected) {
  if (!exactDnsRecord(record, expected)) throw new Error('unsafe_dns_delete_candidate');
  await cloudflareRequest(
    `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(record.id)}`,
    'dns_record_delete',
    { method: 'DELETE' },
  );
}

async function createWwwRecord(zoneId, content, proxied, comment) {
  const { result } = await cloudflareRequest(
    `/zones/${encodeURIComponent(zoneId)}/dns_records`,
    'dns_record_create',
    {
      method: 'POST',
      body: {
        type: 'CNAME',
        name: canonicalHost,
        content,
        proxied,
        ttl: 1,
        comment,
      },
    },
  );
  if (typeof result?.id !== 'string') throw new Error('dns_record_create_missing_id');
  return result;
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function waitForProvider(classification, attempts = 120, delayMs = 5_000) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await providerSnapshot();
    if (classifyProviderSnapshot(last) === classification) return last;
    await sleep(delayMs);
  }
  throw new Error(`provider_state_timeout:${classification}:${classifyProviderSnapshot(last)}`);
}

async function establishCandidate() {
  const before = await providerSnapshot();
  if (classifyProviderSnapshot(before) !== 'legacy_v1')
    throw new Error(`candidate_establish_requires_legacy:${classifyProviderSnapshot(before)}`);
  const zoneId = before.zoneId;
  const legacyRecord = before.wwwRecords[0];
  await deleteExactRecord(zoneId, legacyRecord, {
    type: 'CNAME',
    name: canonicalHost,
    content: legacyWwwCname,
    proxied: false,
    ttl: 1,
  });
  await createWwwRecord(zoneId, platformDomain, true, 'CryptoPayMap production P6-08 go-live');
  await addPagesDomain();
  return waitForProvider('candidate_active');
}

async function rollbackToLegacy() {
  const before = await providerSnapshot();
  const classification = classifyProviderSnapshot(before);
  if (!['candidate_active', 'candidate_pending', 'conflict'].includes(classification)) {
    if (classification === 'legacy_v1') return before;
    throw new Error(`rollback_unhandled_state:${classification}`);
  }

  const zoneId = before.zoneId;
  const candidateRecords = before.wwwRecords.filter((record) =>
    exactDnsRecord(record, {
      type: 'CNAME',
      name: canonicalHost,
      content: platformDomain,
      proxied: true,
      ttl: 1,
    }),
  );
  const legacyRecords = before.wwwRecords.filter((record) =>
    exactDnsRecord(record, {
      type: 'CNAME',
      name: canonicalHost,
      content: legacyWwwCname,
      proxied: false,
      ttl: 1,
    }),
  );
  if (before.wwwRecords.length !== candidateRecords.length + legacyRecords.length)
    throw new Error('rollback_www_record_conflict');
  if (before.customDomains.some((domain) => normalizeHostname(domain?.name) !== canonicalHost))
    throw new Error('rollback_custom_domain_conflict');

  if (before.wwwDomains.length > 0) {
    if (before.wwwDomains.length !== 1) throw new Error('rollback_www_domain_conflict');
    await deletePagesDomain();
    await sleep(3_000);
  }
  for (const record of candidateRecords) {
    await deleteExactRecord(zoneId, record, {
      type: 'CNAME',
      name: canonicalHost,
      content: platformDomain,
      proxied: true,
      ttl: 1,
    });
  }
  if (legacyRecords.length === 0) {
    await createWwwRecord(zoneId, legacyWwwCname, false, 'Restored CryptoPayMap legacy Vercel CNAME');
  } else if (legacyRecords.length !== 1) {
    throw new Error('rollback_multiple_legacy_records');
  }
  return waitForProvider('legacy_v1', 60, 5_000);
}

async function publicDnsObservation(mode) {
  const apexAddresses = await dns.resolve4(apexHost);
  if (!apexAddresses.includes(legacyA)) throw new Error('apex_dns_changed');
  if (mode === 'legacy') {
    const cnames = await dns.resolveCname(canonicalHost);
    if (cnames.length !== 1 || normalizeHostname(cnames[0]) !== legacyWwwCname)
      throw new Error('legacy_www_dns_not_converged');
    return { mode, apexDigest: digest(apexAddresses.sort()), canonicalDigest: digest(cnames.sort()) };
  }
  const addresses = await dns.resolve4(canonicalHost);
  if (addresses.length === 0) throw new Error('candidate_www_dns_missing');
  let cnames = [];
  try {
    cnames = await dns.resolveCname(canonicalHost);
  } catch {}
  if (cnames.some((value) => normalizeHostname(value) === legacyWwwCname))
    throw new Error('candidate_www_dns_still_legacy');
  return { mode, apexDigest: digest(apexAddresses.sort()), canonicalDigest: digest(addresses.sort()) };
}

async function verifyApexRedirect(phase) {
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `/p6-016-probe/${nonce}`;
  const query = `phase=${encodeURIComponent(phase)}&preserve=1`;
  const response = await fetch(`https://${apexHost}${path}?${query}`, {
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const expectedLocation = `https://${canonicalHost}${path}?${query}`;
  if (response.status !== 307) throw new Error(`apex_redirect_status:${response.status}`);
  if (response.headers.get('location') !== expectedLocation) throw new Error('apex_redirect_location_mismatch');
  if ((response.headers.get('server') ?? '').toLowerCase() !== 'vercel')
    throw new Error('apex_redirect_provider_changed');
  return { status: response.status, locationDigest: digest(expectedLocation), server: 'vercel' };
}

async function verifyLegacyExternal() {
  const apex = await verifyApexRedirect('rollback');
  const response = await fetch(`https://${canonicalHost}/?p6_016_legacy=${Date.now()}`, {
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status !== 200) throw new Error(`legacy_www_status:${response.status}`);
  if ((response.headers.get('server') ?? '').toLowerCase() !== 'vercel')
    throw new Error('legacy_www_provider_changed');
  const dnsObservation = await publicDnsObservation('legacy');
  return { apex, wwwStatus: 200, provider: 'vercel', dnsDigest: digest(dnsObservation) };
}

async function fetchJson(path) {
  const response = await fetch(`https://${canonicalHost}${path}?p6_016=${Date.now()}`, {
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type')?.split(';')[0] ?? null,
    value: await response.json().catch(() => null),
  };
}

async function verifyCandidateExternal(candidate) {
  const apex = await verifyApexRedirect('candidate');
  const routes = [
    ['/', 200, 'text/html'],
    ['/version.json', 200, 'application/json'],
    ['/data/manifest.json', 200, 'application/json'],
    ['/robots.txt', 200, 'text/plain'],
  ];
  const routeObservations = [];
  for (const [path, expectedStatus, expectedType] of routes) {
    const response = await fetch(`https://${canonicalHost}${path}?p6_016=${Date.now()}`, {
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get('content-type')?.split(';')[0] ?? null;
    if (response.status !== expectedStatus) throw new Error(`candidate_route_status:${path}:${response.status}`);
    if (contentType !== expectedType) throw new Error(`candidate_route_type:${path}:${contentType}`);
    routeObservations.push({ path, status: response.status, contentType, bodyDigest: digest(bytes) });
  }

  const marker = await fetchJson('/p6-05-release.json');
  if (
    marker.status !== 200 ||
    digest(marker.value?.releaseId ?? '') !== candidate.releaseAuthorityDigest ||
    marker.value?.candidateArtifactId !== candidate.candidateArtifactId ||
    marker.value?.publicTreeDigest !== candidate.publicTreeDigest
  ) {
    throw new Error('candidate_release_marker_mismatch');
  }

  const version = await fetchJson('/version.json');
  const manifest = await fetchJson('/data/manifest.json');
  if (
    version.value?.datasetVersion !== candidate.datasetVersion ||
    version.value?.schemaVersion !== candidate.schemaVersion ||
    version.value?.canonicalOnly !== true ||
    manifest.value?.datasetVersion !== candidate.datasetVersion ||
    manifest.value?.schemaVersion !== candidate.schemaVersion ||
    manifest.value?.canonicalOnly !== true
  ) {
    throw new Error('candidate_machine_identity_mismatch');
  }

  const admin = await fetch(`https://${canonicalHost}/admin/?p6_016=${Date.now()}`, {
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  if (admin.status !== 403) throw new Error(`candidate_admin_not_fail_closed:${admin.status}`);
  if (admin.headers.get('cache-control') !== 'private, no-store')
    throw new Error('candidate_admin_cache_policy_missing');
  if (admin.headers.get('x-robots-tag') !== 'noindex, nofollow, noarchive')
    throw new Error('candidate_admin_robots_policy_missing');
  if (admin.headers.get('x-content-type-options') !== 'nosniff')
    throw new Error('candidate_admin_content_policy_missing');

  const dnsObservation = await publicDnsObservation('candidate');
  return {
    apex,
    routesDigest: digest(routeObservations),
    routeCount: routeObservations.length,
    adminStatus: admin.status,
    dnsDigest: digest(dnsObservation),
  };
}

async function waitForExternal(mode, candidate, attempts = 120, delayMs = 5_000) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return mode === 'legacy' ? await verifyLegacyExternal() : await verifyCandidateExternal(candidate);
    } catch (error) {
      lastError = error;
      await sleep(delayMs);
    }
  }
  throw new Error(`external_${mode}_timeout:${safeException(lastError)}`);
}

async function execute(statusRoot, outputPath) {
  const now = new Date();
  const commit = process.env.APPROVED_COMMIT ?? '';
  const confirmation = process.env.CONFIRMATION ?? '';
  const expectedAuthorizationId = process.env.AUTHORIZATION_ID ?? '';
  const executionOwner = process.env.EXECUTION_OWNER ?? '';
  const rollbackOwner = process.env.ROLLBACK_OWNER ?? '';
  const repositoryContractOutcome = process.env.REPOSITORY_CONTRACT_OUTCOME ?? 'failed';
  const workflowRunId = process.env.WORKFLOW_RUN_ID ?? null;
  const blockers = [];

  if (!validCommit(commit)) blockers.push('approved_commit:invalid');
  if (confirmation !== exactConfirmation) blockers.push('confirmation:invalid');
  if (!validDigest(expectedAuthorizationId)) blockers.push('authorization_id:invalid');
  if (repositoryContractOutcome !== 'success') blockers.push('repository_contract:failed');

  const evidence = readEvidenceBundle(
    statusRoot,
    commit,
    expectedAuthorizationId,
    executionOwner,
    rollbackOwner,
    now,
  );
  blockers.push(...evidence.blockers);
  const uniqueBlockers = [...new Set(blockers)];

  const baseReceipt = {
    version: 1,
    evidenceId,
    environment,
    commit: validCommit(commit) ? commit : null,
    authorizationIdDigest: validDigest(expectedAuthorizationId) ? digest(expectedAuthorizationId) : null,
    generatedAt: now.toISOString(),
    workflowRunId,
    operators: {
      executionOwnerDigest: validOwner(executionOwner) ? digest(executionOwner) : null,
      rollbackOwnerDigest: validOwner(rollbackOwner) ? digest(rollbackOwner) : null,
    },
    evidenceBinding: evidence.authorization?.productionEvidenceBinding ?? null,
  };

  if (uniqueBlockers.length > 0) {
    const receipt = {
      ...baseReceipt,
      state: 'verification_failed',
      checks: { repositoryContract: repositoryContractOutcome, productionMutation: false },
      blockers: uniqueBlockers,
      exceptions: [],
    };
    writeJson(outputPath, receipt);
    return receipt;
  }

  let legacySnapshot = null;
  let candidateFirst = null;
  let rollbackSnapshot = null;
  let candidateFinal = null;
  let externalFirst = null;
  let externalRollback = null;
  let externalFinal = null;
  let mutationStarted = false;
  let rollbackSucceeded = false;
  let state = 'verification_failed';
  const exceptions = [];

  try {
    legacySnapshot = await providerSnapshot();
    if (classifyProviderSnapshot(legacySnapshot) !== 'legacy_v1')
      throw new Error(`pre_state_not_legacy:${classifyProviderSnapshot(legacySnapshot)}`);
    await waitForExternal('legacy', evidence.candidate, 10, 2_000);

    mutationStarted = true;
    candidateFirst = await establishCandidate();
    if (safeSnapshot(candidateFirst).apexRecordDigest !== safeSnapshot(legacySnapshot).apexRecordDigest)
      throw new Error('apex_records_changed_during_cutover');
    if (candidateFirst.stagingProjectDigest !== legacySnapshot.stagingProjectDigest)
      throw new Error('staging_project_changed_during_cutover');
    externalFirst = await waitForExternal('candidate', evidence.candidate);

    rollbackSnapshot = await rollbackToLegacy();
    rollbackSucceeded = true;
    if (safeSnapshot(rollbackSnapshot).apexRecordDigest !== safeSnapshot(legacySnapshot).apexRecordDigest)
      throw new Error('apex_records_changed_during_rollback');
    if (rollbackSnapshot.stagingProjectDigest !== legacySnapshot.stagingProjectDigest)
      throw new Error('staging_project_changed_during_rollback');
    externalRollback = await waitForExternal('legacy', evidence.candidate);

    candidateFinal = await establishCandidate();
    rollbackSucceeded = false;
    if (safeSnapshot(candidateFinal).apexRecordDigest !== safeSnapshot(legacySnapshot).apexRecordDigest)
      throw new Error('apex_records_changed_during_final_restore');
    if (candidateFinal.stagingProjectDigest !== legacySnapshot.stagingProjectDigest)
      throw new Error('staging_project_changed_during_final_restore');
    externalFinal = await waitForExternal('candidate', evidence.candidate);
    state = 'accepted';
  } catch (error) {
    exceptions.push(safeException(error));
    if (mutationStarted) {
      try {
        rollbackSnapshot = await rollbackToLegacy();
        externalRollback = await waitForExternal('legacy', evidence.candidate, 60, 5_000);
        rollbackSucceeded = true;
        state = 'rolled_back';
      } catch (rollbackError) {
        exceptions.push(`rollback_failed:${safeException(rollbackError)}`);
        state = 'verification_failed';
      }
    }
  }

  const receipt = {
    ...baseReceipt,
    state,
    completedAt: new Date().toISOString(),
    checks: {
      repositoryContract: 'passed',
      authorization: 'passed',
      preState: legacySnapshot
        ? { status: classifyProviderSnapshot(legacySnapshot) === 'legacy_v1' ? 'passed' : 'failed', digest: digest(safeSnapshot(legacySnapshot)) }
        : { status: 'not_run', digest: null },
      candidateCutover: candidateFirst
        ? { status: 'passed', digest: digest(safeSnapshot(candidateFirst)) }
        : { status: 'not_run', digest: null },
      candidateExternal: externalFirst
        ? { status: 'passed', digest: digest(externalFirst) }
        : { status: 'not_run', digest: null },
      rollback: rollbackSnapshot
        ? { status: rollbackSucceeded || state === 'accepted' ? 'passed' : 'failed', digest: digest(safeSnapshot(rollbackSnapshot)) }
        : { status: 'not_run', digest: null },
      rollbackExternal: externalRollback
        ? { status: 'passed', digest: digest(externalRollback) }
        : { status: 'not_run', digest: null },
      finalRestore: candidateFinal
        ? { status: state === 'accepted' ? 'passed' : 'failed', digest: digest(safeSnapshot(candidateFinal)) }
        : { status: 'not_run', digest: null },
      finalExternal: externalFinal
        ? { status: state === 'accepted' ? 'passed' : 'failed', digest: digest(externalFinal) }
        : { status: 'not_run', digest: null },
      apexMutation: false,
      unrelatedDnsMutation: false,
      stagingMutation: false,
      productionMutation: mutationStarted,
      launchClosed: false,
    },
    blockers: [],
    exceptions,
  };
  writeJson(outputPath, receipt);
  return receipt;
}

function fixtureSnapshot(kind = 'legacy') {
  const apexRecords = [
    { id: 'apex-a', type: 'A', name: apexHost, content: legacyA, proxied: false, ttl: 1 },
    {
      id: 'apex-txt',
      type: 'TXT',
      name: apexHost,
      content: legacyVerificationTxt,
      proxied: false,
      ttl: 3600,
    },
  ];
  const wwwRecords = [
    kind === 'legacy'
      ? {
          id: 'www-legacy',
          type: 'CNAME',
          name: canonicalHost,
          content: legacyWwwCname,
          proxied: false,
          ttl: 1,
        }
      : {
          id: 'www-candidate',
          type: 'CNAME',
          name: canonicalHost,
          content: platformDomain,
          proxied: true,
          ttl: 1,
        },
  ];
  const wwwDomains =
    kind === 'legacy' ? [] : [{ id: 'domain', name: canonicalHost, status: 'active' }];
  return {
    projectSafe: true,
    zoneSafe: true,
    stagingProjectSafe: true,
    projectIdDigest: digest('project'),
    zoneId: 'zone-id',
    zoneIdDigest: digest('zone-id'),
    stagingProjectDigest: digest('staging-project'),
    apexRecords,
    wwwRecords,
    customDomains: wwwDomains,
    wwwDomains,
  };
}

function assert(value, message) {
  if (!value) throw new Error(`self_test_failed:${message}`);
}

function selfTest() {
  const legacy = fixtureSnapshot('legacy');
  const candidate = fixtureSnapshot('candidate');
  assert(classifyProviderSnapshot(legacy) === 'legacy_v1', 'legacy topology must classify');
  assert(classifyProviderSnapshot(candidate) === 'candidate_active', 'candidate topology must classify');

  const changedApex = structuredClone(legacy);
  changedApex.apexRecords[0].content = '203.0.113.1';
  assert(classifyProviderSnapshot(changedApex) === 'conflict', 'changed apex must fail closed');

  const extraRecord = structuredClone(legacy);
  extraRecord.wwwRecords.push({
    id: 'extra',
    type: 'TXT',
    name: canonicalHost,
    content: 'unexpected',
    proxied: false,
    ttl: 300,
  });
  assert(classifyProviderSnapshot(extraRecord) === 'conflict', 'extra www record must fail closed');

  const pending = structuredClone(candidate);
  pending.wwwDomains[0].status = 'pending';
  assert(classifyProviderSnapshot(pending) === 'candidate_pending', 'pending candidate must classify');

  assert(
    exactDnsRecord(legacy.wwwRecords[0], {
      type: 'CNAME',
      name: canonicalHost,
      content: legacyWwwCname,
      proxied: false,
      ttl: 1,
    }),
    'legacy exact delete predicate must accept exact record',
  );
  assert(
    !exactDnsRecord(legacy.wwwRecords[0], {
      type: 'CNAME',
      name: canonicalHost,
      content: platformDomain,
      proxied: true,
      ttl: 1,
    }),
    'legacy record must not match candidate delete predicate',
  );

  const root = mkdtempSync(resolve(tmpdir(), 'cpm-p6-016-'));
  try {
    const statusRoot = resolve(root, 'status');
    const commit = 'a'.repeat(40);
    const now = new Date('2026-08-12T00:00:00.000Z');
    const candidateReceipt = {
      version: 1,
      evidenceId: 'P6-08-CANDIDATE',
      state: 'accepted',
      environment: 'configured_production_candidate',
      commit,
      generatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60 * 60_000).toISOString(),
      releaseAuthorityDigest: digest('release-authority'),
      p605ReceiptDigest: digest('p605'),
      publicTreeDigest: 'b'.repeat(64),
      candidateArtifactId: digest('candidate'),
      datasetVersion: 'candidate-dataset',
      schemaVersion: '1.0.0',
      checks: {
        projectTopology: { safe: true },
        deployment: 'passed',
        externalVerification: 'passed',
        liveDomainMutation: false,
        dnsMutation: false,
        canonicalHostMutation: false,
      },
      exceptions: [],
    };
    const readinessReceipt = {
      version: 1,
      evidenceId: 'P6-08-READINESS',
      state: 'diagnosed',
      decision: 'ready',
      environment: 'configured_production',
      commit,
      generatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 45 * 60_000).toISOString(),
      checks: { productionMutation: false },
      blockers: [],
    };
    const productionEvidenceBinding = {
      releaseAuthorityDigest: candidateReceipt.releaseAuthorityDigest,
      candidateArtifactId: candidateReceipt.candidateArtifactId,
      publicTreeDigest: candidateReceipt.publicTreeDigest,
      datasetVersion: candidateReceipt.datasetVersion,
      schemaVersion: candidateReceipt.schemaVersion,
      candidateReceiptDigest: digest(JSON.stringify(candidateReceipt)),
      readinessReceiptDigest: digest(JSON.stringify(readinessReceipt)),
    };
    const executionOwner = 'production-launch-owner';
    const rollbackOwner = 'production-rollback-owner';
    const authorizationId = digest('authorization');
    const authorizationReceipt = {
      version: 1,
      authorizationId,
      state: 'authorized',
      environment: 'configured_production',
      mode: 'authorization',
      approvedCommit: commit,
      generatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
      operators: { launchOwner: digest(executionOwner), rollbackOwner: digest(rollbackOwner) },
      checks: {
        productionCandidateBootstrap: { state: 'current_accepted' },
        productionReadiness: { state: 'current_ready' },
        productionMutation: false,
      },
      productionEvidenceBinding,
    };
    writeJson(resolve(statusRoot, authorizationPath), authorizationReceipt);
    writeJson(resolve(statusRoot, candidatePath), candidateReceipt);
    writeJson(resolve(statusRoot, readinessPath), readinessReceipt);
    let evidence = readEvidenceBundle(
      statusRoot,
      commit,
      authorizationId,
      executionOwner,
      rollbackOwner,
      now,
    );
    assert(evidence.blockers.length === 0, 'valid evidence bundle must pass');
    evidence = readEvidenceBundle(
      statusRoot,
      commit,
      digest('wrong-authorization'),
      executionOwner,
      rollbackOwner,
      now,
    );
    assert(
      evidence.blockers.includes('production_authorization:not_current'),
      'wrong authorization id must fail closed',
    );
    console.log('OPS-P6-016 production go-live executor self-test passed.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const [statusRoot, outputPath] = process.argv.slice(2);
  if (!statusRoot || !outputPath) throw new Error('Usage: go-live-executor <status-root> <output-path>');
  const receipt = await execute(statusRoot, outputPath);
  console.log(`Production go-live execution state: ${receipt.state}`);
  if (receipt.state !== 'accepted') process.exitCode = 1;
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) await main();
