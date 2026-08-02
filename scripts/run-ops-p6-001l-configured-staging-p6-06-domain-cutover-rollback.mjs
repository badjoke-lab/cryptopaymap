import { createHash } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { Resolver } from 'node:dns/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import tls from 'node:tls';

const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_06';
const evidenceId = 'P6-06';
const approvedHostname = 'staging.cryptopaymap.com';
const approvedZoneName = 'cryptopaymap.com';
const projectName = 'cryptopaymap-staging';
const productionBranch = 'staging-review';
const platformDomain = `${projectName}.pages.dev`;
const expiryHours = 72;
const bindingKeys = ['releaseId', 'dataSnapshotId', 'configurationId', 'environmentId'];
const predecessorPaths = [
  ['P6-01', 'config/staging-authorization/p6-01-data-qa-receipt.json'],
  ['P6-02', 'config/staging-authorization/p6-02-identity-admin-receipt.json'],
  ['P6-03', 'config/staging-authorization/p6-03-neon-transaction-receipt.json'],
  ['P6-04', 'config/staging-authorization/p6-04-r2-media-lifecycle-receipt.json'],
  ['P6-05', 'config/staging-authorization/p6-05-public-export-release-receipt.json'],
];
const diagnosticPath = 'config/staging-authorization/p6-06-domain-topology-diagnostic.json';
const acceptedReceiptPath = 'config/staging-authorization/p6-06-domain-cutover-rollback-receipt.json';
const publicRoutes = [
  ['/', 200, 'text/html'],
  ['/places/', 200, 'text/html'],
  ['/place/staging-coffee-tokyo/', 200, 'text/html'],
  ['/online/', 200, 'text/html'],
  ['/service/staging-vpn/', 200, 'text/html'],
  ['/version.json', 200, 'application/json'],
  ['/data/manifest.json', 200, 'application/json'],
  ['/robots.txt', 200, 'text/plain'],
  ['/staging-review/media/place-cover.webp', 200, 'image/webp'],
  ['/__p6_06_missing__', 404, 'text/html'],
  ['/admin/api/dashboard', 403, 'text/plain'],
];

function sha256(value) {
  const hash = createHash('sha256');
  if (typeof value === 'string' || value instanceof Uint8Array) hash.update(value);
  else hash.update(JSON.stringify(value), 'utf8');
  return hash.digest('hex');
}

function boundedHash(value) {
  return `sha256:${sha256(value)}`;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validCommit(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
}

function validOperator(value) {
  return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 100;
}

function validChangeWindow(value) {
  return typeof value === 'string' && value.trim().length >= 4 && value.trim().length <= 120;
}

function validZoneId(value) {
  return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
}

function safeTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function normalizeHostname(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\.$/, '') : null;
}

function safeError(error) {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/[^a-zA-Z0-9:_./-]/g, '_').slice(0, 220);
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function readJson(path) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function readPredecessor(statusRoot, expectedEvidenceId, relativePath, commit, now) {
  const receipt = readJson(resolve(statusRoot, relativePath));
  const generatedAt = safeTimestamp(receipt?.generatedAt);
  const expiresAt = safeTimestamp(receipt?.expiresAt);
  const binding = isObject(receipt?.binding) ? receipt.binding : null;
  const bindingValid =
    binding !== null &&
    bindingKeys.every(
      (key) => typeof binding[key] === 'string' && /^sha256:[a-f0-9]{64}$/.test(binding[key]),
    );
  const current =
    receipt?.version === 1 &&
    receipt?.evidenceId === expectedEvidenceId &&
    receipt?.environment === 'configured_staging' &&
    receipt?.state === 'accepted' &&
    receipt?.commit === commit &&
    generatedAt !== null &&
    expiresAt !== null &&
    Date.parse(expiresAt) > now.getTime() &&
    bindingValid;
  return {
    evidenceId: expectedEvidenceId,
    path: relativePath,
    state: current
      ? 'current'
      : receipt === null
        ? 'missing'
        : expiresAt !== null && Date.parse(expiresAt) <= now.getTime()
          ? 'stale'
          : 'failed',
    generatedAt,
    expiresAt,
    binding: current ? Object.fromEntries(bindingKeys.map((key) => [key, binding[key]])) : null,
    receipt: current ? receipt : null,
  };
}

function sharedBinding(predecessors) {
  if (predecessors.some((item) => item.state !== 'current' || item.binding === null)) return null;
  const first = JSON.stringify(predecessors[0].binding);
  return predecessors.every((item) => JSON.stringify(item.binding) === first)
    ? predecessors[0].binding
    : null;
}

function readDiagnostic(statusRoot, commit, now) {
  const receipt = readJson(resolve(statusRoot, diagnosticPath));
  const expiresAt = safeTimestamp(receipt?.expiresAt);
  const current =
    receipt?.version === 1 &&
    receipt?.evidenceId === 'P6-06-DIAGNOSTIC' &&
    receipt?.environment === 'configured_staging' &&
    receipt?.state === 'diagnosed' &&
    receipt?.decision === 'no_candidate' &&
    receipt?.commit === commit &&
    expiresAt !== null &&
    Date.parse(expiresAt) > now.getTime() &&
    receipt?.checks?.permissions?.dnsList === 'success' &&
    receipt?.checks?.topology?.zoneMatchesExpected === true &&
    receipt?.checks?.inventory?.selectedZoneCount === 1 &&
    receipt?.checks?.inventory?.candidateCount === 0 &&
    Array.isArray(receipt?.exceptions) &&
    receipt.exceptions.length === 0;
  return {
    path: diagnosticPath,
    state: current ? 'current_no_candidate' : receipt === null ? 'missing' : 'failed',
    decision: receipt?.decision ?? null,
    generatedAt: safeTimestamp(receipt?.generatedAt),
    expiresAt,
    digest: current ? boundedHash(JSON.stringify(receipt)) : null,
  };
}

function readCurrentAccepted(statusRoot, commit, binding, now) {
  const receipt = readJson(resolve(statusRoot, acceptedReceiptPath));
  const expiresAt = safeTimestamp(receipt?.expiresAt);
  const current =
    receipt?.version === 1 &&
    receipt?.evidenceId === evidenceId &&
    receipt?.environment === 'configured_staging' &&
    receipt?.state === 'accepted' &&
    receipt?.commit === commit &&
    receipt?.checks?.hostname?.digest === boundedHash(approvedHostname) &&
    expiresAt !== null &&
    Date.parse(expiresAt) > now.getTime() &&
    binding !== null &&
    JSON.stringify(receipt?.binding) === JSON.stringify(binding);
  return current ? receipt : null;
}

class CloudflareApiError extends Error {
  constructor(label, status, codes) {
    super(`${label}:${status}:${codes.length > 0 ? codes.join(',') : 'unknown'}`);
    this.name = 'CloudflareApiError';
    this.status = status;
    this.codes = codes;
  }
}

async function cloudflareRequest(
  path,
  label,
  { method = 'GET', body = undefined, allowNotFound = false } = {},
) {
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
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  if (allowNotFound && response.status === 404) return { found: false, result: null };
  if (!response.ok || payload?.success !== true) {
    const codes = Array.isArray(payload?.errors)
      ? payload.errors
          .map((item) => item?.code)
          .filter((value) => Number.isInteger(value))
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

function safeSnapshot(snapshot) {
  return {
    projectSafe: snapshot.projectSafe,
    zoneSafe: snapshot.zoneSafe,
    projectCustomDomainCount: snapshot.customDomains.length,
    hostnameDomainCount: snapshot.hostnameDomains.length,
    hostnameDomainStatuses: snapshot.hostnameDomains
      .map((item) => (typeof item?.status === 'string' ? item.status : 'unknown'))
      .sort(),
    hostnameRecordCount: snapshot.hostnameRecords.length,
    hostnameRecordClasses: snapshot.hostnameRecords
      .map((record) => ({
        type: typeof record?.type === 'string' ? record.type : null,
        targetMatches: normalizeHostname(record?.content) === platformDomain,
        proxied: record?.proxied === true,
        ttlAutomatic: record?.ttl === 1,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
}

function classifySnapshot(snapshot) {
  const exactRecord =
    snapshot.hostnameRecords.length === 1 &&
    snapshot.hostnameRecords[0]?.type === 'CNAME' &&
    normalizeHostname(snapshot.hostnameRecords[0]?.content) === platformDomain &&
    snapshot.hostnameRecords[0]?.proxied === true;
  const exactDomain =
    snapshot.hostnameDomains.length === 1 &&
    normalizeHostname(snapshot.hostnameDomains[0]?.name) === approvedHostname;
  const noOtherDomains = snapshot.customDomains.length === snapshot.hostnameDomains.length;
  if (!snapshot.projectSafe || !snapshot.zoneSafe || !noOtherDomains) return 'conflict';
  if (snapshot.hostnameDomains.length === 0 && snapshot.hostnameRecords.length === 0)
    return 'absent';
  if (exactDomain && exactRecord)
    return snapshot.hostnameDomains[0]?.status === 'active' ? 'final_active' : 'final_pending';
  return 'conflict';
}

async function providerSnapshot() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const zoneId = process.env.P6_06_STAGING_ZONE_ID;
  if (!accountId || !validZoneId(zoneId)) throw new Error('provider_identifiers_missing');
  const [{ result: project }, { result: domains }, { result: zones }] = await Promise.all([
    cloudflareRequest(
      `/accounts/${encodeURIComponent(accountId)}/pages/projects/${projectName}`,
      'pages_project_get',
    ),
    cloudflareRequest(
      `/accounts/${encodeURIComponent(accountId)}/pages/projects/${projectName}/domains`,
      'pages_domains_list',
    ),
    cloudflareRequest(
      `/zones?account.id=${encodeURIComponent(accountId)}&status=active&per_page=50&page=1`,
      'zones_list',
    ),
  ]);
  const selectedZones = Array.isArray(zones)
    ? zones.filter((zone) => zone?.id === zoneId)
    : [];
  const selectedZone = selectedZones.length === 1 ? selectedZones[0] : null;
  const records = selectedZone === null ? [] : await listDnsRecords(zoneId);
  const hostnameRecords = records.filter(
    (record) => normalizeHostname(record?.name) === approvedHostname,
  );
  const allDomains = Array.isArray(domains) ? domains : [];
  const customDomains = allDomains.filter(
    (domain) => normalizeHostname(domain?.name) !== platformDomain,
  );
  const hostnameDomains = customDomains.filter(
    (domain) => normalizeHostname(domain?.name) === approvedHostname,
  );
  const projectDomains = Array.isArray(project?.domains)
    ? project.domains.map(normalizeHostname).filter(Boolean)
    : [];
  const projectSafe =
    project?.name === projectName &&
    project?.production_branch === productionBranch &&
    normalizeHostname(project?.subdomain) === platformDomain &&
    projectDomains.includes(platformDomain);
  const zoneSafe =
    selectedZone !== null && normalizeHostname(selectedZone?.name) === approvedZoneName;
  return {
    projectSafe,
    zoneSafe,
    zoneName: normalizeHostname(selectedZone?.name),
    customDomains,
    hostnameDomains,
    hostnameRecords,
  };
}

async function addPagesDomain() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const { result } = await cloudflareRequest(
    `/accounts/${encodeURIComponent(accountId)}/pages/projects/${projectName}/domains`,
    'pages_domain_add',
    { method: 'POST', body: { name: approvedHostname } },
  );
  return {
    idDigest: boundedHash(result?.id ?? result?.domain_id ?? 'missing'),
    status: typeof result?.status === 'string' ? result.status : null,
  };
}

async function deletePagesDomain() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  await cloudflareRequest(
    `/accounts/${encodeURIComponent(accountId)}/pages/projects/${projectName}/domains/${encodeURIComponent(approvedHostname)}`,
    'pages_domain_delete',
    { method: 'DELETE', allowNotFound: true },
  );
}

async function createDnsRecord() {
  const zoneId = process.env.P6_06_STAGING_ZONE_ID;
  const { result } = await cloudflareRequest(
    `/zones/${encodeURIComponent(zoneId)}/dns_records`,
    'dns_record_create',
    {
      method: 'POST',
      body: {
        type: 'CNAME',
        name: approvedHostname,
        content: platformDomain,
        ttl: 1,
        proxied: true,
        comment: 'CryptoPayMap configured staging P6-06',
      },
    },
  );
  if (typeof result?.id !== 'string') throw new Error('dns_record_create_missing_id');
  return { id: result.id, idDigest: boundedHash(result.id) };
}

async function deleteExactDnsRecord(record) {
  const zoneId = process.env.P6_06_STAGING_ZONE_ID;
  if (
    typeof record?.id !== 'string' ||
    record.type !== 'CNAME' ||
    normalizeHostname(record.name) !== approvedHostname ||
    normalizeHostname(record.content) !== platformDomain
  )
    throw new Error('unsafe_dns_delete_candidate');
  await cloudflareRequest(
    `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(record.id)}`,
    'dns_record_delete',
    { method: 'DELETE' },
  );
}

async function waitForProvider(classification, attempts, delayMs) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await providerSnapshot();
    if (classifySnapshot(last) === classification) return last;
    await sleep(delayMs);
  }
  throw new Error(`provider_${classification}_timeout_${classifySnapshot(last)}`);
}

async function establishFinalTopology(mutationState) {
  const before = await providerSnapshot();
  if (classifySnapshot(before) !== 'absent')
    throw new Error(`establish_requires_absent_${classifySnapshot(before)}`);
  const dnsReceipt = await createDnsRecord();
  mutationState.dnsRecordId = dnsReceipt.id;
  const pagesReceipt = await addPagesDomain();
  mutationState.pagesDomainCreated = true;
  const final = await waitForProvider('final_active', 120, 10_000);
  return {
    pagesReceipt,
    dnsReceipt: { idDigest: dnsReceipt.idDigest },
    providerDigest: boundedHash(safeSnapshot(final)),
  };
}

async function rollbackOwnedToAbsent(mutationState) {
  let deletedRecordCount = 0;
  if (mutationState.pagesDomainCreated) {
    await deletePagesDomain();
    mutationState.pagesDomainCreated = false;
    await sleep(5_000);
  }
  if (mutationState.dnsRecordId !== null) {
    const snapshot = await providerSnapshot();
    const owned = snapshot.hostnameRecords.find(
      (record) => record?.id === mutationState.dnsRecordId,
    );
    if (owned !== undefined) {
      await deleteExactDnsRecord(owned);
      deletedRecordCount = 1;
    }
    mutationState.dnsRecordId = null;
  }
  const absent = await waitForProvider('absent', 30, 5_000);
  return { providerDigest: boundedHash(safeSnapshot(absent)), deletedRecordCount };
}

async function queryDoh(endpoint, hostname, type) {
  const url = `${endpoint}?name=${encodeURIComponent(hostname)}&type=${encodeURIComponent(type)}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/dns-json' },
    cache: 'no-store',
  });
  const body = await response.json();
  const answers = Array.isArray(body?.Answer)
    ? body.Answer.map((item) => ({
        type: item?.type ?? null,
        dataDigest: boundedHash(item?.data ?? 'missing'),
      }))
    : [];
  return {
    status: Number.isInteger(body?.Status) ? body.Status : null,
    answerCount: answers.length,
    answerDigest: boundedHash(answers),
  };
}

async function authoritativeObservation(zoneName, hostname) {
  const nameServers = await dns.resolveNs(zoneName);
  const addresses = [];
  for (const nameServer of nameServers.slice(0, 4)) {
    try {
      addresses.push(...(await dns.resolve4(nameServer)));
    } catch {}
  }
  if (addresses.length === 0) throw new Error('authoritative_nameserver_addresses_missing');
  const resolver = new Resolver();
  resolver.setServers(addresses);
  try {
    const values = await resolver.resolve4(hostname, { ttl: true });
    return {
      answerCount: values.length,
      answerDigest: boundedHash(
        values
          .map((item) => ({ address: boundedHash(item.address), ttl: item.ttl }))
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      ),
    };
  } catch (error) {
    if (['ENODATA', 'ENOTFOUND', 'SERVFAIL'].includes(error?.code))
      return { answerCount: 0, answerDigest: boundedHash([]) };
    throw error;
  }
}

async function dnsObservation(expectPresent) {
  const [cloudflare, google, authoritative] = await Promise.all([
    queryDoh('https://cloudflare-dns.com/dns-query', approvedHostname, 'A'),
    queryDoh('https://dns.google/resolve', approvedHostname, 'A'),
    authoritativeObservation(approvedZoneName, approvedHostname),
  ]);
  const observedPresent =
    cloudflare.status === 0 &&
    cloudflare.answerCount > 0 &&
    google.status === 0 &&
    google.answerCount > 0 &&
    authoritative.answerCount > 0;
  const observedAbsent =
    cloudflare.answerCount === 0 &&
    google.answerCount === 0 &&
    authoritative.answerCount === 0;
  return {
    passed: expectPresent ? observedPresent : observedAbsent,
    digest: boundedHash({ cloudflare, google, authoritative }),
    resolverCount: 3,
  };
}

async function waitForDns(expectPresent, attempts = 120, delayMs = 5_000) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await dnsObservation(expectPresent);
    if (last.passed) return last;
    await sleep(delayMs);
  }
  throw new Error(
    `external_dns_${expectPresent ? 'present' : 'absent'}_timeout_${last?.digest ?? 'none'}`,
  );
}

async function tlsObservation() {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = tls.connect(
      {
        host: approvedHostname,
        port: 443,
        servername: approvedHostname,
        rejectUnauthorized: true,
        timeout: 15_000,
      },
      () => {
        try {
          const certificate = socket.getPeerCertificate(true);
          const san =
            typeof certificate?.subjectaltname === 'string' ? certificate.subjectaltname : '';
          const validTo = safeTimestamp(certificate?.valid_to);
          const protocol = socket.getProtocol();
          const passed =
            socket.authorized === true &&
            san.toLowerCase().includes(approvedHostname) &&
            validTo !== null &&
            Date.parse(validTo) > Date.now() + 7 * 24 * 60 * 60 * 1_000 &&
            ['TLSv1.2', 'TLSv1.3'].includes(protocol);
          socket.end();
          resolvePromise({
            passed,
            protocol,
            validTo,
            certificateDigest: boundedHash(
              certificate?.fingerprint256 ?? certificate?.fingerprint ?? 'missing',
            ),
            issuerDigest: boundedHash(JSON.stringify(certificate?.issuer ?? {})),
            hostnameCovered: san.toLowerCase().includes(approvedHostname),
          });
        } catch (error) {
          socket.destroy();
          rejectPromise(error);
        }
      },
    );
    socket.on('timeout', () => socket.destroy(new Error('tls_timeout')));
    socket.on('error', rejectPromise);
  });
}

function canonicalFromHtml(html) {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/\brel\s*=\s*["'][^"']*canonical[^"']*["']/i.test(tag)) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? null;
    return href;
  }
  return null;
}

function noPrivateLeakage(text) {
  return !/(database_url|cloudflare_api_token|private submission|storage key|signed url|contact email|session cookie)/i.test(
    text,
  );
}

async function verifyExternal(p6Receipt) {
  const dnsResult = await waitForDns(true);
  let tlsResult = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      tlsResult = await tlsObservation();
      if (tlsResult.passed) break;
    } catch {}
    await sleep(10_000);
  }
  if (!tlsResult?.passed) throw new Error('tls_not_ready');

  const redirect = await fetch(`http://${approvedHostname}/?p6_06=${Date.now()}`, {
    redirect: 'manual',
    cache: 'no-store',
  });
  const location = redirect.headers.get('location');
  if (
    ![301, 302, 307, 308].includes(redirect.status) ||
    typeof location !== 'string' ||
    !location.startsWith(`https://${approvedHostname}/`)
  )
    throw new Error(`http_redirect_invalid_${redirect.status}`);

  const routeResults = [];
  for (const [path, expectedStatus, expectedType] of publicRoutes) {
    const response = await fetch(
      `https://${approvedHostname}${path}?p6_06=${Date.now()}-${Math.random()}`,
      { redirect: 'manual', cache: 'no-store' },
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get('content-type')?.split(';')[0] ?? null;
    const text = new TextDecoder().decode(bytes).slice(0, 32_768);
    if (response.status !== expectedStatus)
      throw new Error(`route_status_${path}_${response.status}`);
    if (contentType !== expectedType) throw new Error(`route_type_${path}_${contentType}`);
    if (!noPrivateLeakage(text)) throw new Error(`route_private_leakage_${path}`);
    if (expectedType === 'text/html') {
      const canonical = canonicalFromHtml(text);
      if (canonical !== null) {
        const canonicalUrl = new URL(canonical, `https://${approvedHostname}${path}`);
        if (canonicalUrl.hostname !== approvedHostname)
          throw new Error(`canonical_host_mismatch_${path}`);
      }
    }
    routeResults.push({
      path,
      status: response.status,
      contentType,
      bodyDigest: sha256(bytes),
    });
  }

  const markerResponse = await fetch(
    `https://${approvedHostname}/p6-05-release.json?p6_06_marker=${Date.now()}`,
    { cache: 'no-store' },
  );
  if (markerResponse.status !== 200)
    throw new Error(`release_marker_status_${markerResponse.status}`);
  const marker = await markerResponse.json();
  const expectedReleaseId = p6Receipt?.checks?.releases?.candidate?.releaseId;
  if (typeof expectedReleaseId !== 'string' || marker?.releaseId !== expectedReleaseId)
    throw new Error('active_release_identity_mismatch');

  return {
    status: 'passed',
    dns: dnsResult,
    tls: tlsResult,
    redirect: { status: redirect.status, locationDigest: boundedHash(location) },
    routeCount: routeResults.length,
    routeDigest: boundedHash(routeResults),
    releaseId: expectedReleaseId,
  };
}

async function verifyExternalAbsent() {
  const dnsResult = await waitForDns(false);
  return { status: 'passed', dns: dnsResult };
}

async function bestEffortRollback(exceptions, mutationState) {
  try {
    if (mutationState.pagesDomainCreated || mutationState.dnsRecordId !== null) {
      await rollbackOwnedToAbsent(mutationState);
      return;
    }
    const snapshot = await providerSnapshot();
    if (classifySnapshot(snapshot) !== 'absent')
      exceptions.push(`cleanup:unowned_provider_conflict_${classifySnapshot(snapshot)}`);
  } catch (error) {
    exceptions.push(`cleanup:${safeError(error)}`);
  }
}

async function execute(statusRoot, outputPath) {
  const now = new Date();
  const commit = process.env.APPROVED_COMMIT;
  const owner = process.env.DOMAIN_OWNER;
  const confirmation = process.env.CONFIRMATION;
  const hostnameInput = normalizeHostname(process.env.APPROVED_HOSTNAME);
  const changeWindow = process.env.CHANGE_WINDOW;
  const repositoryContract = process.env.REPOSITORY_CONTRACT_OUTCOME === 'success';
  const predecessors = validCommit(commit)
    ? predecessorPaths.map(([id, path]) => readPredecessor(statusRoot, id, path, commit, now))
    : predecessorPaths.map(([id, path]) => ({
        evidenceId: id,
        path,
        state: 'failed',
        generatedAt: null,
        expiresAt: null,
        binding: null,
        receipt: null,
      }));
  const binding = sharedBinding(predecessors);
  const diagnostic = validCommit(commit)
    ? readDiagnostic(statusRoot, commit, now)
    : {
        path: diagnosticPath,
        state: 'failed',
        decision: null,
        generatedAt: null,
        expiresAt: null,
        digest: null,
      };
  const p6Receipt = predecessors.find((item) => item.evidenceId === 'P6-05')?.receipt ?? null;
  const exceptions = [];
  const checks = {
    exactMain: validCommit(commit) ? 'success' : 'failed',
    confirmation: confirmation === exactConfirmation ? 'success' : 'failed',
    hostname: {
      status: hostnameInput === approvedHostname ? 'success' : 'failed',
      digest: hostnameInput === null ? null : boundedHash(hostnameInput),
    },
    owner: validOperator(owner) ? 'success' : 'failed',
    changeWindow: {
      status: validChangeWindow(changeWindow) ? 'success' : 'failed',
      digest: validChangeWindow(changeWindow) ? boundedHash(changeWindow.trim()) : null,
    },
    repositoryContract: repositoryContract ? 'success' : 'failed',
    predecessors: predecessors.map(({ binding: _binding, receipt: _receipt, ...item }) => item),
    predecessorBinding: binding === null ? 'failed' : 'matched',
    diagnostic,
    duplicate: { status: 'not_run', reused: false },
    preState: { status: 'not_run', digest: null, recheckMatched: false },
    cutover: {
      status: 'not_run',
      providerDigest: null,
      pagesReceiptDigest: null,
      dnsReceiptDigest: null,
    },
    externalCutover: { status: 'not_run' },
    rollback: { status: 'not_run', providerDigest: null, deletedRecordCount: null },
    externalRollback: { status: 'not_run' },
    finalRestore: {
      status: 'not_run',
      providerDigest: null,
      pagesReceiptDigest: null,
      dnsReceiptDigest: null,
    },
    externalFinal: { status: 'not_run' },
  };

  const preconditions =
    checks.exactMain === 'success' &&
    checks.confirmation === 'success' &&
    checks.hostname.status === 'success' &&
    checks.owner === 'success' &&
    checks.changeWindow.status === 'success' &&
    checks.repositoryContract === 'success' &&
    predecessors.every((item) => item.state === 'current') &&
    binding !== null &&
    diagnostic.state === 'current_no_candidate' &&
    Boolean(process.env.CLOUDFLARE_API_TOKEN) &&
    Boolean(process.env.CLOUDFLARE_ACCOUNT_ID) &&
    validZoneId(process.env.P6_06_STAGING_ZONE_ID);

  let state = 'failed';
  const mutationState = { pagesDomainCreated: false, dnsRecordId: null };
  if (!preconditions) {
    exceptions.push('preconditions:failed');
  } else {
    try {
      await cloudflareRequest('/user/tokens/verify', 'token_verify');
      const initial = await providerSnapshot();
      const acceptedExisting = readCurrentAccepted(statusRoot, commit, binding, now);
      if (acceptedExisting !== null && classifySnapshot(initial) === 'final_active') {
        checks.duplicate = { status: 'passed', reused: true };
        checks.preState = {
          status: 'existing_final',
          digest: boundedHash(safeSnapshot(initial)),
          recheckMatched: true,
        };
        checks.cutover = {
          status: 'existing',
          providerDigest: boundedHash(safeSnapshot(initial)),
          pagesReceiptDigest: null,
          dnsReceiptDigest: null,
        };
        checks.externalFinal = await verifyExternal(p6Receipt);
        state = 'accepted';
      } else {
        if (classifySnapshot(initial) !== 'absent')
          throw new Error(`prestate_conflict_${classifySnapshot(initial)}`);
        const preStateDigest = boundedHash(safeSnapshot(initial));
        const recheck = await providerSnapshot();
        const recheckDigest = boundedHash(safeSnapshot(recheck));
        checks.preState = {
          status:
            preStateDigest === recheckDigest && classifySnapshot(recheck) === 'absent'
              ? 'passed'
              : 'failed',
          digest: preStateDigest,
          recheckMatched: preStateDigest === recheckDigest,
        };
        if (checks.preState.status !== 'passed')
          throw new Error('prestate_changed_before_mutation');

        const cutover = await establishFinalTopology(mutationState);
        checks.cutover = {
          status: 'passed',
          providerDigest: cutover.providerDigest,
          pagesReceiptDigest: boundedHash(cutover.pagesReceipt),
          dnsReceiptDigest: boundedHash(cutover.dnsReceipt),
        };
        checks.externalCutover = await verifyExternal(p6Receipt);

        const rollback = await rollbackOwnedToAbsent(mutationState);
        checks.rollback = { status: 'passed', ...rollback };
        checks.externalRollback = await verifyExternalAbsent();

        const restored = await establishFinalTopology(mutationState);
        checks.finalRestore = {
          status: 'passed',
          providerDigest: restored.providerDigest,
          pagesReceiptDigest: boundedHash(restored.pagesReceipt),
          dnsReceiptDigest: boundedHash(restored.dnsReceipt),
        };
        checks.externalFinal = await verifyExternal(p6Receipt);
        state = 'accepted';
      }
    } catch (error) {
      exceptions.push(`execution:${safeError(error)}`);
      await bestEffortRollback(exceptions, mutationState);
    }
  }

  const generatedAt = new Date().toISOString();
  const receipt = {
    version: 1,
    evidenceId,
    launchDomain: 'domain_cutover_rollback',
    environment: 'configured_staging',
    state: state === 'accepted' && exceptions.length === 0 ? 'accepted' : 'failed',
    commit: validCommit(commit) ? commit : null,
    generatedAt,
    expiresAt: new Date(
      Date.parse(generatedAt) + expiryHours * 60 * 60 * 1_000,
    ).toISOString(),
    workflowRunId: process.env.WORKFLOW_RUN_ID ?? null,
    owner: validOperator(owner) ? boundedHash(owner.trim()) : null,
    procedure:
      'OPS-P6-001L configured staging P6-06 guarded domain cutover and rollback evidence',
    checks,
    ...(binding === null ? {} : { binding }),
    exceptions: [...new Set(exceptions)].sort(),
  };
  mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(resolve(outputPath), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`OPS-P6-001L receipt state: ${receipt.state}`);
  if (receipt.state !== 'accepted') process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Self-test failed: ${message}`);
}

function runSelfTest() {
  const base = {
    projectSafe: true,
    zoneSafe: true,
    customDomains: [],
    hostnameDomains: [],
    hostnameRecords: [],
  };
  assert(classifySnapshot(base) === 'absent', 'empty approved hostname must be absent');
  const pending = {
    ...base,
    customDomains: [{ name: approvedHostname, status: 'pending' }],
    hostnameDomains: [{ name: approvedHostname, status: 'pending' }],
    hostnameRecords: [
      {
        id: 'record',
        name: approvedHostname,
        type: 'CNAME',
        content: platformDomain,
        proxied: true,
        ttl: 1,
      },
    ],
  };
  assert(
    classifySnapshot(pending) === 'final_pending',
    'pending exact topology must be pending',
  );
  const active = {
    ...pending,
    customDomains: [{ name: approvedHostname, status: 'active' }],
    hostnameDomains: [{ name: approvedHostname, status: 'active' }],
  };
  assert(classifySnapshot(active) === 'final_active', 'active exact topology must be final');
  assert(
    classifySnapshot({
      ...active,
      hostnameRecords: [
        ...active.hostnameRecords,
        { name: approvedHostname, type: 'TXT', content: 'x' },
      ],
    }) === 'conflict',
    'multiple records must conflict',
  );
  const safe = JSON.stringify(safeSnapshot(active));
  assert(!safe.includes('record'), 'record identifiers must not be retained');
  assert(
    !safe.includes(approvedHostname),
    'raw hostname must not be retained in provider snapshot',
  );
  assert(
    boundedHash(approvedHostname) === boundedHash(approvedHostname),
    'hostname digest must be deterministic',
  );
  console.log('OPS-P6-001L configured staging P6-06 guarded cutover self-test passed.');
}

const args = process.argv.slice(2);
if (args[0] === '--self-test') {
  runSelfTest();
} else {
  const statusRoot = args[0];
  const outputPath = args[1];
  if (!statusRoot || !outputPath || !existsSync(statusRoot))
    throw new Error('Usage: node script <status-root> <output-path>');
  await execute(statusRoot, outputPath);
}

export { classifySnapshot, safeSnapshot };
