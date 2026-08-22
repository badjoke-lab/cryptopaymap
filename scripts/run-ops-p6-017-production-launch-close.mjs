import { createHash } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import tls from 'node:tls';
import { pathToFileURL } from 'node:url';

const exactConfirmation = 'OBSERVE_AND_CLOSE_CONFIGURED_PRODUCTION';
const exactIncidentClearance = 'NO_LAUNCH_BLOCKING_INCIDENT';
const evidenceId = 'P6-08-LAUNCH-CLOSE';
const environment = 'configured_production';
const apexHost = 'cryptopaymap.com';
const redirectHost = 'www.cryptopaymap.com';
const canonicalHost = apexHost;
const canonicalOrigin = `https://${canonicalHost}`;
const legacyA = '216.198.79.1';
const legacyWwwCname = '02eeaa61ea1e3365.vercel-dns-017.com';
const goLivePath = 'config/production-authorization/go-live-receipt.json';
const authorizationPath = 'config/production-authorization/authorization-receipt.json';
const candidatePath = 'config/production-authorization/production-candidate-bootstrap-receipt.json';
const operationalEvidence = [
  ['P6-07-Q2', 'config/staging-authorization/p6-07-monitoring-alert-receipt.json'],
  ['P6-07-Q3', 'config/staging-authorization/p6-07-backup-integrity-receipt.json'],
  ['P6-07-Q4', 'config/staging-authorization/p6-07-isolated-restore-receipt.json'],
  ['P6-07-Q5', 'config/staging-authorization/p6-07-operations-recovery-receipt.json'],
];

function digest(value) {
  const hash = createHash('sha256');
  hash.update(
    typeof value === 'string' || value instanceof Uint8Array ? value : JSON.stringify(value),
  );
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

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
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

function safeException(error) {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/[^a-zA-Z0-9:_./-]/g, '_').slice(0, 200);
}

function boundedInteger(value, min, max) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function parseRegister(raw, kind, now, observationEnd) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw ?? '[]'));
  } catch {
    return { items: [], blockers: [`${kind}_register:invalid_json`] };
  }
  if (!Array.isArray(parsed) || parsed.length > 10) {
    return { items: [], blockers: [`${kind}_register:invalid_shape`] };
  }
  const blockers = [];
  const items = parsed.map((item, index) => {
    if (!isObject(item)) {
      blockers.push(`${kind}_register:item_${index}_invalid`);
      return null;
    }
    const id =
      typeof item.id === 'string' && /^[A-Za-z0-9._-]{1,40}$/.test(item.id) ? item.id : null;
    const owner = typeof item.owner === 'string' ? item.owner.trim() : '';
    const deadline = safeTimestamp(item.deadline);
    const status = typeof item.status === 'string' ? item.status : null;
    const severity = kind === 'risk' && typeof item.severity === 'string' ? item.severity : null;
    if (id === null || !validOwner(owner) || deadline === null || status === null) {
      blockers.push(`${kind}_register:item_${index}_invalid`);
      return null;
    }
    if (Date.parse(deadline) <= now.getTime())
      blockers.push(`${kind}_register:${id}:deadline_expired`);
    if (Date.parse(deadline) <= observationEnd.getTime())
      blockers.push(`${kind}_register:${id}:deadline_inside_observation`);
    if (kind === 'risk' && !['low', 'medium', 'high', 'launch_blocking'].includes(severity))
      blockers.push(`${kind}_register:${id}:severity_invalid`);
    if (kind === 'risk' && severity === 'launch_blocking' && status !== 'closed')
      blockers.push(`risk_register:${id}:launch_blocking`);
    return {
      id,
      ownerDigest: digest(owner),
      deadline,
      status,
      ...(kind === 'risk' ? { severity } : {}),
    };
  });
  return { items: items.filter(Boolean), blockers };
}

function readEvidenceBundle(statusRoot, commit, observationEnd) {
  const blockers = [];
  const goLive = readJson(resolve(statusRoot, goLivePath));
  const authorization = readJson(resolve(statusRoot, authorizationPath));
  const candidate = readJson(resolve(statusRoot, candidatePath));

  const goLiveCurrent =
    goLive?.version === 1 &&
    goLive?.evidenceId === 'P6-08-GO-LIVE' &&
    goLive?.environment === environment &&
    goLive?.state === 'accepted' &&
    goLive?.commit === commit &&
    goLive?.checks?.authorization === 'passed' &&
    goLive?.checks?.rollback?.status === 'passed' &&
    goLive?.checks?.rollbackExternal?.status === 'passed' &&
    goLive?.checks?.finalRestore?.status === 'passed' &&
    goLive?.checks?.finalExternal?.status === 'passed' &&
    goLive?.checks?.apexMutation === true &&
    goLive?.checks?.unrelatedDnsMutation === false &&
    goLive?.checks?.stagingMutation === false &&
    goLive?.checks?.launchClosed === false &&
    Array.isArray(goLive?.blockers) &&
    goLive.blockers.length === 0 &&
    Array.isArray(goLive?.exceptions) &&
    goLive.exceptions.length === 0 &&
    validDigest(goLive?.authorizationIdDigest) &&
    isObject(goLive?.evidenceBinding) &&
    validDigest(goLive.evidenceBinding?.releaseAuthorityDigest) &&
    validDigest(goLive.evidenceBinding?.candidateArtifactId) &&
    typeof goLive.evidenceBinding?.publicTreeDigest === 'string' &&
    /^[a-f0-9]{64}$/.test(goLive.evidenceBinding.publicTreeDigest) &&
    typeof goLive.evidenceBinding?.datasetVersion === 'string' &&
    typeof goLive.evidenceBinding?.schemaVersion === 'string' &&
    validDigest(goLive.evidenceBinding?.credentialGenerationDigest);
  if (!goLiveCurrent) blockers.push('go_live:not_accepted_or_incomplete');

  const authorizationMatches =
    authorization?.version === 1 &&
    authorization?.state === 'authorized' &&
    authorization?.environment === environment &&
    authorization?.approvedCommit === commit &&
    validDigest(authorization?.authorizationId) &&
    digest(authorization.authorizationId) === goLive?.authorizationIdDigest &&
    digest(authorization?.productionEvidenceBinding ?? null) ===
      digest(goLive?.evidenceBinding ?? null) &&
    isObject(authorization?.binding) &&
    ['releaseId', 'dataSnapshotId', 'configurationId', 'environmentId'].every((key) =>
      validDigest(authorization.binding[key]),
    );
  if (!authorizationMatches) blockers.push('authorization:historical_binding_mismatch');

  const candidateMatches =
    candidate?.version === 1 &&
    candidate?.state === 'accepted' &&
    candidate?.environment === 'configured_production_candidate' &&
    candidate?.commit === commit &&
    candidate?.candidateArtifactId === goLive?.evidenceBinding?.candidateArtifactId &&
    candidate?.publicTreeDigest === goLive?.evidenceBinding?.publicTreeDigest &&
    candidate?.datasetVersion === goLive?.evidenceBinding?.datasetVersion &&
    candidate?.schemaVersion === goLive?.evidenceBinding?.schemaVersion &&
    candidate?.credentialGenerationDigest === goLive?.evidenceBinding?.credentialGenerationDigest;
  if (!candidateMatches) blockers.push('candidate:historical_binding_mismatch');

  const operations = [];
  for (const [expectedId, path] of operationalEvidence) {
    const receipt = readJson(resolve(statusRoot, path));
    const expiresAt = safeTimestamp(receipt?.expiresAt);
    const current =
      receipt?.version === 1 &&
      receipt?.evidenceId === expectedId &&
      receipt?.state === 'accepted' &&
      receipt?.commit === commit &&
      expiresAt !== null &&
      Date.parse(expiresAt) > observationEnd.getTime() &&
      Array.isArray(receipt?.exceptions) &&
      receipt.exceptions.length === 0;
    if (!current) blockers.push(`${expectedId.toLowerCase()}:not_current_through_observation`);
    if (
      expectedId === 'P6-07-Q2' &&
      (receipt?.checks?.liveMonitoring?.status !== 'passed' ||
        receipt?.checks?.alertExercise?.status !== 'passed')
    )
      blockers.push('p6-07-q2:monitoring_or_alert_exercise_failed');
    operations.push({
      evidenceId: expectedId,
      path,
      state: current ? 'current' : 'stale_or_failed',
      expiresAt,
      receiptDigest: receipt === null ? null : digest(JSON.stringify(receipt)),
    });
  }

  return { blockers, goLive, authorization, candidate, operations };
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function observeTls(hostname) {
  return new Promise((resolvePromise, reject) => {
    const socket = tls.connect(
      { host: hostname, port: 443, servername: hostname, rejectUnauthorized: true },
      () => {
        try {
          const certificate = socket.getPeerCertificate();
          const validTo = safeTimestamp(certificate?.valid_to);
          if (!socket.authorized || validTo === null || Date.parse(validTo) <= Date.now())
            throw new Error('tls_certificate_invalid');
          const protocol = socket.getProtocol();
          if (typeof protocol !== 'string' || !protocol.startsWith('TLSv1.'))
            throw new Error('tls_protocol_invalid');
          const certificateIdentity = [
            certificate?.fingerprint256 ?? null,
            certificate?.subject?.CN ?? null,
            certificate?.issuer?.CN ?? null,
            validTo,
          ];
          resolvePromise({
            protocol,
            validTo,
            certificateDigest: digest(certificateIdentity),
            hostnameCovered: true,
          });
        } catch (error) {
          reject(error);
        } finally {
          socket.end();
        }
      },
    );
    socket.setTimeout(20_000, () => socket.destroy(new Error('tls_observation_timeout')));
    socket.once('error', reject);
  });
}

async function fetchBytes(path, expectedStatus, expectedType) {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`${canonicalOrigin}${path}${separator}p6_017=${Date.now()}`, {
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get('content-type')?.split(';')[0] ?? null;
  if (response.status !== expectedStatus)
    throw new Error(`route_status:${path}:${response.status}`);
  if (contentType !== expectedType) throw new Error(`route_type:${path}:${contentType}`);
  return { response, bytes, text: new TextDecoder().decode(bytes), contentType };
}

async function collectExternalSample(expected, observedAt = new Date()) {
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const probePath = `/p6-017-probe/${nonce}`;
  const query = 'preserve=1';
  const redirect = await fetch(`https://${redirectHost}${probePath}?${query}`, {
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  const expectedLocation = `${canonicalOrigin}${probePath}?${query}`;
  if (redirect.status !== 308 || redirect.headers.get('location') !== expectedLocation)
    throw new Error('www_redirect_mismatch');

  const apexAddresses = (await dns.resolve4(apexHost)).sort();
  if (apexAddresses.length === 0 || apexAddresses.includes(legacyA))
    throw new Error('canonical_apex_dns_not_converged');
  const redirectAddresses = (await dns.resolve4(redirectHost)).sort();
  if (redirectAddresses.length === 0) throw new Error('redirect_dns_missing');
  let redirectCnames = [];
  try {
    redirectCnames = (await dns.resolveCname(redirectHost)).map((value) =>
      value.toLowerCase().replace(/\.$/, ''),
    );
  } catch {}
  if (redirectCnames.includes(legacyWwwCname)) throw new Error('redirect_dns_returned_to_legacy');

  const tlsObservation = await observeTls(canonicalHost);
  const redirectTlsObservation = await observeTls(redirectHost);
  const routes = [
    ['/', 200, 'text/html'],
    ['/places/', 200, 'text/html'],
    ['/online/', 200, 'text/html'],
    ['/stats/', 200, 'text/html'],
    ['/updates/', 200, 'text/html'],
    ['/data/', 200, 'text/html'],
    ['/methodology/', 200, 'text/html'],
    ['/version.json', 200, 'application/json'],
    ['/data/manifest.json', 200, 'application/json'],
    ['/robots.txt', 200, 'text/plain'],
    ['/llms.txt', 200, 'text/plain'],
    ['/ai.txt', 200, 'text/plain'],
    ['/sitemap.xml', 200, 'application/xml'],
    ['/icons/cryptopaymap.svg', 200, 'image/svg+xml'],
  ];
  const routeObservations = [];
  const bodies = new Map();
  for (const [path, status, type] of routes) {
    const result = await fetchBytes(path, status, type);
    routeObservations.push({
      path,
      status,
      contentType: result.contentType,
      bodyDigest: digest(result.bytes),
    });
    bodies.set(path, result.text);
  }

  const admin = await fetch(`${canonicalOrigin}/admin/?p6_017=${Date.now()}`, {
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  if (admin.status !== 403) throw new Error(`admin_not_fail_closed:${admin.status}`);
  if (admin.headers.get('cache-control') !== 'private, no-store')
    throw new Error('admin_cache_policy_missing');
  if (admin.headers.get('x-robots-tag') !== 'noindex, nofollow, noarchive')
    throw new Error('admin_robots_policy_missing');
  if (admin.headers.get('x-content-type-options') !== 'nosniff')
    throw new Error('admin_content_policy_missing');

  const markerResult = await fetchBytes('/p6-05-release.json', 200, 'application/json');
  const marker = JSON.parse(markerResult.text);
  if (
    digest(marker?.releaseId ?? '') !== expected.releaseAuthorityDigest ||
    marker?.candidateArtifactId !== expected.candidateArtifactId ||
    marker?.publicTreeDigest !== expected.publicTreeDigest
  )
    throw new Error('release_marker_mismatch');

  const version = JSON.parse(bodies.get('/version.json'));
  const manifest = JSON.parse(bodies.get('/data/manifest.json'));
  if (
    version?.datasetVersion !== expected.datasetVersion ||
    version?.schemaVersion !== expected.schemaVersion ||
    version?.canonicalOnly !== true ||
    version?.verificationMarker !== 'reviewed_public_records_only' ||
    manifest?.datasetVersion !== expected.datasetVersion ||
    manifest?.schemaVersion !== expected.schemaVersion ||
    manifest?.canonicalOnly !== true ||
    !Array.isArray(manifest?.files) ||
    manifest.files.length < 1
  )
    throw new Error('public_data_identity_mismatch');
  for (const file of manifest.files) {
    if (
      typeof file?.path !== 'string' ||
      !Number.isInteger(file?.recordCount) ||
      file.recordCount < 0 ||
      typeof file?.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      throw new Error('public_manifest_file_invalid');
  }

  const robots = bodies.get('/robots.txt');
  const llms = bodies.get('/llms.txt');
  const ai = bodies.get('/ai.txt');
  const sitemap = bodies.get('/sitemap.xml');
  if (
    !robots.includes('Allow: /') ||
    !robots.includes('Disallow: /admin/') ||
    !robots.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`)
  )
    throw new Error('robots_contract_mismatch');
  if (!llms.includes('# CryptoPayMap') || !llms.includes('/data/manifest.json'))
    throw new Error('llms_contract_mismatch');
  if (!ai.includes('Project: CryptoPayMap') || !ai.includes('reviewed public records only'))
    throw new Error('ai_contract_mismatch');
  if (!sitemap.includes(`<loc>${canonicalOrigin}/</loc>`) || sitemap.includes('/admin/'))
    throw new Error('sitemap_contract_mismatch');

  return {
    status: 'passed',
    observedAt: observedAt.toISOString(),
    wwwRedirect: { status: 308, locationDigest: digest(expectedLocation) },
    dns: {
      apexAddressCount: apexAddresses.length,
      apexDigest: digest(apexAddresses),
      redirectAddressCount: redirectAddresses.length,
      redirectDigest: digest(redirectAddresses),
      legacyCnamePresent: false,
    },
    tls: { canonical: tlsObservation, redirect: redirectTlsObservation },
    release: {
      markerDigest: digest(markerResult.bytes),
      candidateArtifactId: marker.candidateArtifactId,
      publicTreeDigest: marker.publicTreeDigest,
    },
    data: {
      datasetVersion: version.datasetVersion,
      schemaVersion: version.schemaVersion,
      manifestFileCount: manifest.files.length,
      manifestDigest: digest(bodies.get('/data/manifest.json')),
    },
    routes: { count: routeObservations.length, digest: digest(routeObservations) },
    admin: {
      status: 403,
      policyDigest: digest([
        admin.headers.get('cache-control'),
        admin.headers.get('x-robots-tag'),
        admin.headers.get('x-content-type-options'),
      ]),
    },
    machineFilesDigest: digest([robots, llms, ai, sitemap]),
  };
}

function normalizeSamples(samples, expectedCount) {
  if (!Array.isArray(samples) || samples.length !== expectedCount) return null;
  const normalized = [];
  for (const sample of samples) {
    if (
      sample?.status !== 'passed' ||
      safeTimestamp(sample?.observedAt) === null ||
      sample?.admin?.status !== 403 ||
      sample?.dns?.legacyCnamePresent !== false ||
      sample?.release?.candidateArtifactId === undefined
    )
      return null;
    normalized.push(sample);
  }
  return normalized;
}

export async function executeProductionLaunchClose(options) {
  const start = options.now instanceof Date ? options.now : new Date();
  const clock = typeof options.clock === 'function' ? options.clock : () => new Date();
  const sleepFn = typeof options.sleepFn === 'function' ? options.sleepFn : sleep;
  const sampleCollector =
    typeof options.sampleCollector === 'function' ? options.sampleCollector : collectExternalSample;
  const commit = String(options.commit ?? '').trim();
  const confirmation = String(options.confirmation ?? '').trim();
  const observationOwner = String(options.observationOwner ?? '').trim();
  const incidentOwner = String(options.incidentOwner ?? '').trim();
  const incidentClearance = String(options.incidentClearance ?? '').trim();
  const credentialGenerationId = String(options.credentialGenerationId ?? '').trim();
  const repositoryContractOutcome = String(options.repositoryContractOutcome ?? 'failed');
  const observationMinutes = boundedInteger(options.observationMinutes, 15, 60);
  const sampleIntervalMinutes = boundedInteger(options.sampleIntervalMinutes, 5, 15);
  const blockers = [];

  if (!validCommit(commit)) blockers.push('approved_commit:invalid');
  if (confirmation !== exactConfirmation) blockers.push('confirmation:invalid');
  if (!validOwner(observationOwner)) blockers.push('observation_owner:invalid');
  if (!validOwner(incidentOwner)) blockers.push('incident_owner:invalid');
  if (incidentClearance !== exactIncidentClearance)
    blockers.push('incident_clearance:not_explicit');
  if (repositoryContractOutcome !== 'success') blockers.push('repository_contract:failed');
  if (observationMinutes === null) blockers.push('observation_window:invalid');
  if (sampleIntervalMinutes === null) blockers.push('sample_interval:invalid');
  if (
    observationMinutes !== null &&
    sampleIntervalMinutes !== null &&
    (observationMinutes % sampleIntervalMinutes !== 0 ||
      observationMinutes / sampleIntervalMinutes + 1 < 3)
  )
    blockers.push('observation_sampling:invalid');

  const durationMs = observationMinutes === null ? 0 : observationMinutes * 60_000;
  const observationEnd = new Date(start.getTime() + durationMs);
  const riskRegister = parseRegister(options.riskRegisterJson, 'risk', start, observationEnd);
  const deferredItems = parseRegister(options.deferredItemsJson, 'deferred', start, observationEnd);
  blockers.push(...riskRegister.blockers, ...deferredItems.blockers);
  const nextReviewAt = safeTimestamp(options.nextReviewAt);
  if (
    nextReviewAt === null ||
    Date.parse(nextReviewAt) <= observationEnd.getTime() ||
    Date.parse(nextReviewAt) > observationEnd.getTime() + 30 * 24 * 60 * 60_000
  )
    blockers.push('next_review_at:invalid');

  const evidence = readEvidenceBundle(options.statusRoot, commit, observationEnd);
  blockers.push(...evidence.blockers);
  const expectedGenerationDigest =
    evidence.goLive?.evidenceBinding?.credentialGenerationDigest ?? null;
  if (
    credentialGenerationId.length < 8 ||
    credentialGenerationId.length > 200 ||
    digest(credentialGenerationId) !== expectedGenerationDigest
  )
    blockers.push('credential_generation:changed_or_invalid');

  if (
    evidence.authorization?.operators?.observer !== digest(observationOwner) ||
    evidence.authorization?.operators?.communicationOwner !== digest(incidentOwner)
  )
    blockers.push('close_operators:not_authorized');

  const sampleCount =
    observationMinutes !== null && sampleIntervalMinutes !== null
      ? observationMinutes / sampleIntervalMinutes + 1
      : 0;
  const baseReceipt = {
    version: 1,
    evidenceId,
    environment,
    commit: validCommit(commit) ? commit : null,
    state: 'verification_failed',
    generatedAt: start.toISOString(),
    workflowRunId: options.workflowRunId ?? null,
    observation: {
      plannedStart: start.toISOString(),
      plannedEnd: observationEnd.toISOString(),
      durationMinutes: observationMinutes,
      sampleIntervalMinutes,
      requiredSampleCount: sampleCount,
    },
    operators: {
      observationOwnerDigest: validOwner(observationOwner) ? digest(observationOwner) : null,
      incidentOwnerDigest: validOwner(incidentOwner) ? digest(incidentOwner) : null,
    },
    binding: evidence.authorization?.binding ?? null,
    productionEvidenceBinding: evidence.goLive?.evidenceBinding ?? null,
    goLiveReceiptDigest: evidence.goLive ? digest(JSON.stringify(evidence.goLive)) : null,
    operationalEvidence: evidence.operations,
    riskRegister: riskRegister.items,
    deferredItems: deferredItems.items,
    nextReviewAt,
    rollback: {
      lastKnownGoodDigest: evidence.goLive?.checks?.preState?.digest ?? null,
      drillStatus: evidence.goLive?.checks?.rollback?.status ?? null,
      externalStatus: evidence.goLive?.checks?.rollbackExternal?.status ?? null,
    },
  };

  const uniquePreflightBlockers = [...new Set(blockers)];
  if (uniquePreflightBlockers.length > 0) {
    const receipt = {
      ...baseReceipt,
      blockers: uniquePreflightBlockers,
      exceptions: [],
      samples: [],
    };
    writeJson(options.outputPath, receipt);
    return receipt;
  }

  const samples = [];
  const exceptions = [];
  for (let index = 0; index < sampleCount; index += 1) {
    if (index > 0) await sleepFn(sampleIntervalMinutes * 60_000);
    try {
      if (digest(credentialGenerationId) !== expectedGenerationDigest)
        throw new Error('credential_generation_changed_during_observation');
      const observedAt = clock();
      const sample = await sampleCollector(evidence.goLive.evidenceBinding, observedAt);
      samples.push(sample);
    } catch (error) {
      exceptions.push(safeException(error));
      break;
    }
  }

  const normalizedSamples = normalizeSamples(samples, sampleCount);
  const closeBlockers = [];
  if (normalizedSamples === null) closeBlockers.push('observation_samples:incomplete_or_failed');
  const completedAt = clock();
  if (completedAt.getTime() < observationEnd.getTime())
    closeBlockers.push('observation_window:not_elapsed');
  if (digest(credentialGenerationId) !== expectedGenerationDigest)
    closeBlockers.push('credential_generation:changed_during_observation');

  const state =
    closeBlockers.length === 0 && exceptions.length === 0 ? 'closed' : 'verification_failed';
  const sampleDigests = samples.map((sample) => digest(sample));
  const receipt = {
    ...baseReceipt,
    state,
    completedAt: completedAt.toISOString(),
    observation: {
      ...baseReceipt.observation,
      actualEnd: completedAt.toISOString(),
      sampleCount: samples.length,
      sampleDigests,
      aggregateSampleDigest: digest(sampleDigests),
    },
    checks: {
      repositoryContract: 'passed',
      goLive: 'accepted',
      operationalEvidence: evidence.operations.every((item) => item.state === 'current')
        ? 'current'
        : 'failed',
      sustainedExternalObservation: state === 'closed' ? 'passed' : 'failed',
      releaseIdentity: state === 'closed' ? 'passed' : 'failed',
      dataIntegrity: state === 'closed' ? 'passed' : 'failed',
      dnsTlsCanonical: state === 'closed' ? 'passed' : 'failed',
      adminBoundary: state === 'closed' ? 'passed' : 'failed',
      monitoringAndAlerts: evidence.operations.find((item) => item.evidenceId === 'P6-07-Q2')
        ?.state,
      backupIntegrity: evidence.operations.find((item) => item.evidenceId === 'P6-07-Q3')?.state,
      restoreEvidence: evidence.operations.find((item) => item.evidenceId === 'P6-07-Q4')?.state,
      operationsRecovery: evidence.operations.find((item) => item.evidenceId === 'P6-07-Q5')?.state,
      incidentClearance: incidentClearance === exactIncidentClearance ? 'passed' : 'failed',
      credentialGeneration:
        digest(credentialGenerationId) === expectedGenerationDigest ? 'matched' : 'failed',
      rollbackReadiness:
        baseReceipt.rollback.drillStatus === 'passed' &&
        baseReceipt.rollback.externalStatus === 'passed'
          ? 'passed'
          : 'failed',
      productionMutation: false,
      launchClosed: state === 'closed',
    },
    blockers: [...new Set(closeBlockers)],
    exceptions,
    samples: samples.map((sample) => ({ observedAt: sample.observedAt, digest: digest(sample) })),
    evidenceIndex: [
      goLivePath,
      authorizationPath,
      candidatePath,
      ...operationalEvidence.map(([, path]) => path),
    ],
  };
  writeJson(options.outputPath, receipt);
  return receipt;
}

function fixtureReceiptSet(root, commit, now, observationEnd, observer, incidentOwner) {
  const generationDigest = digest('production-generation-v1');
  const productionEvidenceBinding = {
    releaseAuthorityDigest: digest('release-id'),
    candidateArtifactId: digest('candidate-artifact'),
    publicTreeDigest: 'a'.repeat(64),
    datasetVersion: 'production-candidate-test',
    schemaVersion: '1.0.0',
    credentialGenerationDigest: generationDigest,
    candidateReceiptDigest: digest('candidate-receipt'),
    readinessReceiptDigest: digest('readiness-receipt'),
  };
  const binding = {
    releaseId: digest('release'),
    dataSnapshotId: digest('data'),
    configurationId: digest('configuration'),
    environmentId: digest('environment'),
  };
  const authorizationId = digest('authorization-id');
  const authorization = {
    version: 1,
    authorizationId,
    state: 'authorized',
    environment,
    approvedCommit: commit,
    operators: { observer: digest(observer), communicationOwner: digest(incidentOwner) },
    binding,
    productionEvidenceBinding,
  };
  const goLive = {
    version: 1,
    evidenceId: 'P6-08-GO-LIVE',
    environment,
    state: 'accepted',
    commit,
    authorizationIdDigest: digest(authorizationId),
    evidenceBinding: productionEvidenceBinding,
    checks: {
      authorization: 'passed',
      preState: { status: 'passed', digest: digest('legacy') },
      rollback: { status: 'passed', digest: digest('rollback') },
      rollbackExternal: { status: 'passed', digest: digest('rollback-external') },
      finalRestore: { status: 'passed', digest: digest('final') },
      finalExternal: { status: 'passed', digest: digest('final-external') },
      apexMutation: true,
      unrelatedDnsMutation: false,
      stagingMutation: false,
      launchClosed: false,
    },
    blockers: [],
    exceptions: [],
  };
  const candidate = {
    version: 1,
    state: 'accepted',
    environment: 'configured_production_candidate',
    commit,
    candidateArtifactId: productionEvidenceBinding.candidateArtifactId,
    publicTreeDigest: productionEvidenceBinding.publicTreeDigest,
    datasetVersion: productionEvidenceBinding.datasetVersion,
    schemaVersion: productionEvidenceBinding.schemaVersion,
    credentialGenerationDigest: generationDigest,
  };
  writeJson(resolve(root, authorizationPath), authorization);
  writeJson(resolve(root, goLivePath), goLive);
  writeJson(resolve(root, candidatePath), candidate);
  for (const [id, path] of operationalEvidence) {
    const receipt = {
      version: 1,
      evidenceId: id,
      state: 'accepted',
      commit,
      generatedAt: now.toISOString(),
      expiresAt: new Date(observationEnd.getTime() + 60 * 60_000).toISOString(),
      checks:
        id === 'P6-07-Q2'
          ? { liveMonitoring: { status: 'passed' }, alertExercise: { status: 'passed' } }
          : {},
      exceptions: [],
    };
    writeJson(resolve(root, path), receipt);
  }
  return { productionEvidenceBinding };
}

function fixtureSample(expected, observedAt) {
  return {
    status: 'passed',
    observedAt: observedAt.toISOString(),
    apexRedirect: { status: 307, locationDigest: digest('location') },
    dns: {
      apexDigest: digest('apex'),
      canonicalAddressCount: 2,
      canonicalDigest: digest('www'),
      legacyCnamePresent: false,
    },
    tls: {
      protocol: 'TLSv1.3',
      validTo: '2026-12-01T00:00:00.000Z',
      certificateDigest: digest('cert'),
      hostnameCovered: true,
    },
    release: {
      markerDigest: digest('marker'),
      candidateArtifactId: expected.candidateArtifactId,
      publicTreeDigest: expected.publicTreeDigest,
    },
    data: {
      datasetVersion: expected.datasetVersion,
      schemaVersion: expected.schemaVersion,
      manifestFileCount: 5,
      manifestDigest: digest('manifest'),
    },
    routes: { count: 14, digest: digest('routes') },
    admin: { status: 403, policyDigest: digest('admin') },
    machineFilesDigest: digest('machine'),
  };
}

function assert(value, message) {
  if (!value) throw new Error(`self_test_failed:${message}`);
}

async function selfTest() {
  const root = mkdtempSync(resolve(tmpdir(), 'cpm-p6-017-'));
  const statusRoot = resolve(root, 'status');
  const outputPath = resolve(root, 'receipt.json');
  const commit = 'a'.repeat(40);
  const start = new Date('2026-08-13T00:00:00.000Z');
  const observationEnd = new Date(start.getTime() + 15 * 60_000);
  const observer = 'independent-production-observer';
  const incidentOwner = 'production-communication-owner';
  fixtureReceiptSet(statusRoot, commit, start, observationEnd, observer, incidentOwner);
  let clockMs = start.getTime();
  const base = {
    statusRoot,
    outputPath,
    commit,
    confirmation: exactConfirmation,
    observationOwner: observer,
    incidentOwner,
    incidentClearance: exactIncidentClearance,
    credentialGenerationId: 'production-generation-v1',
    repositoryContractOutcome: 'success',
    observationMinutes: '15',
    sampleIntervalMinutes: '5',
    riskRegisterJson: '[]',
    deferredItemsJson: '[]',
    nextReviewAt: '2026-08-14T00:00:00.000Z',
    workflowRunId: '4004',
    now: start,
    clock: () => new Date(clockMs),
    sleepFn: async (milliseconds) => {
      clockMs += milliseconds;
    },
    sampleCollector: async (expected, observedAt) => fixtureSample(expected, observedAt),
  };
  try {
    let receipt = await executeProductionLaunchClose(base);
    assert(receipt.state === 'closed', 'complete sustained observation must close launch');
    assert(receipt.checks.productionMutation === false, 'launch-close must remain read-only');
    assert(
      receipt.observation.sampleCount === 4,
      '15-minute window at 5 minutes requires four samples',
    );

    clockMs = start.getTime();
    receipt = await executeProductionLaunchClose({ ...base, confirmation: 'WRONG' });
    assert(
      receipt.blockers.includes('confirmation:invalid'),
      'wrong confirmation must fail closed',
    );

    clockMs = start.getTime();
    receipt = await executeProductionLaunchClose({
      ...base,
      credentialGenerationId: 'production-generation-v2',
    });
    assert(
      receipt.blockers.includes('credential_generation:changed_or_invalid'),
      'changed credential generation must fail closed',
    );

    const q2 = readJson(resolve(statusRoot, operationalEvidence[0][1]));
    q2.expiresAt = new Date(start.getTime() + 10 * 60_000).toISOString();
    writeJson(resolve(statusRoot, operationalEvidence[0][1]), q2);
    clockMs = start.getTime();
    receipt = await executeProductionLaunchClose(base);
    assert(
      receipt.blockers.includes('p6-07-q2:not_current_through_observation'),
      'operational evidence expiring inside window must fail',
    );
    fixtureReceiptSet(statusRoot, commit, start, observationEnd, observer, incidentOwner);

    clockMs = start.getTime();
    let calls = 0;
    receipt = await executeProductionLaunchClose({
      ...base,
      sampleCollector: async (expected, observedAt) => {
        calls += 1;
        if (calls === 3) throw new Error('synthetic_sample_failure');
        return fixtureSample(expected, observedAt);
      },
    });
    assert(receipt.state === 'verification_failed', 'failed sample must prevent close');
    assert(receipt.checks.launchClosed === false, 'failed observation may not claim launch close');

    console.log('OPS-P6-017 configured production launch-close self-test passed.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const [statusRoot, outputPath] = process.argv.slice(2);
  if (!statusRoot || !outputPath)
    throw new Error('Usage: production-launch-close <status-root> <output-path>');
  await executeProductionLaunchClose({
    statusRoot,
    outputPath,
    commit: process.env.APPROVED_COMMIT ?? '',
    confirmation: process.env.CONFIRMATION ?? '',
    observationOwner: process.env.OBSERVATION_OWNER ?? '',
    incidentOwner: process.env.INCIDENT_OWNER ?? '',
    incidentClearance: process.env.INCIDENT_CLEARANCE ?? '',
    credentialGenerationId: process.env.P6_08_PRODUCTION_CREDENTIAL_GENERATION_ID ?? '',
    repositoryContractOutcome: process.env.REPOSITORY_CONTRACT_OUTCOME ?? 'failed',
    observationMinutes: process.env.OBSERVATION_MINUTES ?? '',
    sampleIntervalMinutes: process.env.SAMPLE_INTERVAL_MINUTES ?? '',
    riskRegisterJson: process.env.RISK_REGISTER_JSON ?? '[]',
    deferredItemsJson: process.env.DEFERRED_ITEMS_JSON ?? '[]',
    nextReviewAt: process.env.NEXT_REVIEW_AT ?? '',
    workflowRunId: process.env.WORKFLOW_RUN_ID ?? null,
  });
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) await main();
