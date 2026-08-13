import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const exactConfirmation = 'DIAGNOSE_CONFIGURED_PRODUCTION_READINESS';
const environment = 'configured_production';
const productionProject = 'cryptopaymap-production';
const stagingProject = 'cryptopaymap-staging';
const productionHostname = 'cryptopaymap.com';
const zoneName = 'cryptopaymap.com';
const p605Path = 'config/staging-authorization/p6-05-public-export-release-receipt.json';
const requiredRuntimeSecrets = [
  'P6_08_PRODUCTION_DATABASE_URL',
  'P6_08_PRODUCTION_REVIEW_SECRET_SEED_BASE64URL',
  'P6_08_PRODUCTION_TURNSTILE_SECRET_KEY',
  'P6_08_PRODUCTION_TURNSTILE_SITE_KEY',
  'P6_08_PRODUCTION_CF_ACCESS_TEAM_DOMAIN',
  'P6_08_PRODUCTION_CF_ACCESS_AUD',
  'P6_08_PRODUCTION_CREDENTIAL_GENERATION_ID',
];

function digest(value) {
  const hash = createHash('sha256');
  hash.update(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
  return `sha256:${hash.digest('hex')}`;
}

function readJson(path) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
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

function p605Evidence(statusRoot, commit, now) {
  const receipt = readJson(resolve(statusRoot, p605Path));
  const expiresAt = safeTimestamp(receipt?.expiresAt);
  const releaseId = receipt?.checks?.releases?.candidate?.releaseId ?? null;
  const current =
    receipt?.version === 1 &&
    receipt?.evidenceId === 'P6-05' &&
    receipt?.environment === 'configured_staging' &&
    receipt?.state === 'accepted' &&
    receipt?.commit === commit &&
    expiresAt !== null &&
    Date.parse(expiresAt) > now.getTime() &&
    receipt?.checks?.releases?.status === 'passed' &&
    receipt?.checks?.external?.status === 'passed' &&
    receipt?.checks?.finalState?.status === 'passed' &&
    receipt?.checks?.finalState?.activeKind === 'candidate' &&
    validDigest(releaseId);
  return {
    path: p605Path,
    state: current ? 'current' : receipt === null ? 'missing' : 'stale_or_failed',
    generatedAt: safeTimestamp(receipt?.generatedAt),
    expiresAt,
    releaseId: current ? releaseId : null,
    releaseIdDigest: current ? digest(releaseId) : null,
  };
}

class CloudflareApiError extends Error {
  constructor(label, status) {
    super(`${label}:${status}`);
    this.name = 'CloudflareApiError';
    this.status = status;
  }
}

async function cloudflareRequest(path, label) {
  const method = 'GET';
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('cloudflare_token_missing');
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true)
    throw new CloudflareApiError(label, response.status);
  return { result: payload.result, resultInfo: payload.result_info ?? null };
}

async function collectExternal(expectedReleaseId, fetchImpl = fetch) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error('cloudflare_account_missing');

  let project = null;
  let projectAccessible = false;
  try {
    const response = await cloudflareRequest(
      `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(productionProject)}`,
      'pages_project_get',
    );
    project = response.result;
    projectAccessible = project?.name === productionProject;
  } catch (error) {
    if (!(error instanceof CloudflareApiError && error.status === 404)) throw error;
  }

  const zones = await cloudflareRequest(
    `/zones?name=${encodeURIComponent(zoneName)}&status=active&per_page=50`,
    'zone_lookup',
  );
  const zoneList = Array.isArray(zones.result) ? zones.result : [];
  const exactZones = zoneList.filter(
    (zone) => zone?.name === zoneName && zone?.status === 'active',
  );
  const zone = exactZones.length === 1 ? exactZones[0] : null;

  let dnsRecords = [];
  if (zone?.id) {
    const dns = await cloudflareRequest(
      `/zones/${encodeURIComponent(zone.id)}/dns_records?name=${encodeURIComponent(productionHostname)}&per_page=100`,
      'production_dns_lookup',
    );
    dnsRecords = Array.isArray(dns.result) ? dns.result : [];
  }

  let customDomains = [];
  if (projectAccessible) {
    const domains = await cloudflareRequest(
      `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(productionProject)}/domains`,
      'pages_domains_list',
    );
    customDomains = Array.isArray(domains.result) ? domains.result : [];
  }

  let markerStatus = 0;
  let markerReleaseId = null;
  try {
    const response = await fetchImpl(`https://${productionProject}.pages.dev/p6-05-release.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    markerStatus = response.status;
    const body = await response.json().catch(() => null);
    markerReleaseId = body?.releaseId ?? null;
  } catch {
    markerStatus = 0;
  }

  const markerMatches =
    markerStatus === 200 && validDigest(markerReleaseId) && markerReleaseId === expectedReleaseId;

  let adminAccess = {
    status: 0,
    cacheControl: null,
    robots: null,
    contentOptions: null,
    enforced: false,
  };
  try {
    const response = await fetchImpl(`https://${productionProject}.pages.dev/admin/`, {
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
    const cacheControl = response.headers.get('cache-control');
    const robots = response.headers.get('x-robots-tag');
    const contentOptions = response.headers.get('x-content-type-options');
    adminAccess = {
      status: response.status,
      cacheControl,
      robots,
      contentOptions,
      enforced:
        response.status === 403 &&
        cacheControl === 'private, no-store' &&
        robots === 'noindex, nofollow, noarchive' &&
        contentOptions === 'nosniff',
    };
  } catch {}

  return {
    cloudflare: {
      accountConfigured: true,
      project: {
        name: productionProject,
        distinctFromStaging: productionProject !== stagingProject,
        accessible: projectAccessible,
        projectIdDigest: typeof project?.id === 'string' ? digest(project.id) : null,
        productionBranchDigest:
          typeof project?.production_branch === 'string' ? digest(project.production_branch) : null,
      },
      zone: {
        name: zoneName,
        exactActiveZoneCount: exactZones.length,
        zoneIdDigest: typeof zone?.id === 'string' ? digest(zone.id) : null,
      },
      dns: {
        hostname: productionHostname,
        recordCount: dnsRecords.length,
        records: dnsRecords.map((record) => ({
          type: typeof record?.type === 'string' ? record.type : null,
          proxied: record?.proxied === true,
          idDigest: typeof record?.id === 'string' ? digest(record.id) : null,
          targetDigest: typeof record?.content === 'string' ? digest(record.content) : null,
        })),
      },
      customDomain: {
        hostname: productionHostname,
        attachedToCandidateProject: customDomains.some(
          (domain) => String(domain?.name ?? '').toLowerCase() === productionHostname,
        ),
        domainCount: customDomains.length,
      },
    },
    intendedDeployment: {
      baseUrl: `https://${productionProject}.pages.dev`,
      markerStatus,
      markerMatches,
      expectedReleaseDigest: digest(expectedReleaseId),
      observedReleaseDigest: validDigest(markerReleaseId) ? digest(markerReleaseId) : null,
    },
    adminAccess,
  };
}

function runtimeSecrets() {
  return Object.fromEntries(
    requiredRuntimeSecrets.map((key) => [
      key,
      typeof process.env[key] === 'string' && process.env[key].length > 0,
    ]),
  );
}

export async function executeProductionReadiness(options) {
  const now = options.now instanceof Date ? options.now : new Date();
  const commit = String(options.commit ?? '').trim();
  const confirmation = String(options.confirmation ?? '').trim();
  const readinessOwner = String(options.readinessOwner ?? '').trim();
  const repositoryContractOutcome = String(options.repositoryContractOutcome ?? 'failed');
  const githubEnvironmentStatus = String(options.githubEnvironmentStatus ?? 'missing');
  const protectionCount = Number.parseInt(
    String(options.githubEnvironmentProtectionCount ?? '0'),
    10,
  );
  const p605 = p605Evidence(options.statusRoot, commit, now);
  const secrets = options.runtimeSecrets ?? runtimeSecrets();
  const credentialGenerationId = String(
    options.credentialGenerationId ?? process.env.P6_08_PRODUCTION_CREDENTIAL_GENERATION_ID ?? '',
  ).trim();
  const generationValid =
    credentialGenerationId.length >= 8 && credentialGenerationId.length <= 200;
  const blockers = [];

  if (confirmation !== exactConfirmation) blockers.push('confirmation:invalid');
  if (!validCommit(commit)) blockers.push('approved_commit:invalid');
  if (!validOwner(readinessOwner)) blockers.push('readiness_owner:invalid');
  if (repositoryContractOutcome !== 'success') blockers.push('repository_contract:failed');
  if (p605.state !== 'current') blockers.push('p6_05_release:not_current');
  if (!generationValid) blockers.push('credential_generation:invalid');
  if (githubEnvironmentStatus !== 'present') blockers.push('github_environment:production_missing');
  if (!Number.isInteger(protectionCount) || protectionCount < 1)
    blockers.push('github_environment:protection_missing');

  const missingSecrets = requiredRuntimeSecrets.filter((key) => secrets[key] !== true);
  for (const key of missingSecrets) blockers.push(`runtime_secret:${key}:missing`);

  let external = options.externalOverride ?? null;
  if (external === null && p605.releaseId !== null) {
    try {
      external = await collectExternal(p605.releaseId, options.fetchImpl ?? fetch);
    } catch (error) {
      external = {
        error:
          error instanceof Error
            ? error.message.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 160)
            : 'unknown',
      };
    }
  }

  if (external?.cloudflare?.project?.distinctFromStaging !== true)
    blockers.push('pages_project:not_distinct');
  if (external?.cloudflare?.project?.accessible !== true)
    blockers.push('pages_project:missing_or_inaccessible');
  if (external?.cloudflare?.zone?.exactActiveZoneCount !== 1)
    blockers.push('cloudflare_zone:ambiguous_or_missing');
  if (
    !Number.isInteger(external?.cloudflare?.dns?.recordCount) ||
    external.cloudflare.dns.recordCount < 1
  ) {
    blockers.push('production_dns:missing');
  }
  if (external?.intendedDeployment?.markerMatches !== true)
    blockers.push('intended_release:not_observed');
  if (external?.adminAccess?.enforced !== true) blockers.push('admin_access:not_enforced');

  const uniqueBlockers = [...new Set(blockers)];
  const decision = uniqueBlockers.length === 0 ? 'ready' : 'blocked';
  const receipt = {
    version: 1,
    evidenceId: 'P6-08-READINESS',
    state: 'diagnosed',
    decision,
    environment,
    commit: validCommit(commit) ? commit : null,
    generatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
    workflowRunId: options.workflowRunId ?? null,
    ownerDigest: validOwner(readinessOwner) ? digest(readinessOwner) : null,
    credentialGenerationDigest: generationValid ? digest(credentialGenerationId) : null,
    checks: {
      exactRepositoryContract: repositoryContractOutcome === 'success' ? 'passed' : 'failed',
      p605: {
        state: p605.state,
        path: p605.path,
        generatedAt: p605.generatedAt,
        expiresAt: p605.expiresAt,
        releaseIdDigest: p605.releaseIdDigest,
      },
      githubEnvironment: {
        name: 'production',
        state: githubEnvironmentStatus === 'present' ? 'present' : 'missing',
        protectionRuleCount: Number.isInteger(protectionCount) ? protectionCount : 0,
      },
      runtimeSecrets: {
        requiredCount: requiredRuntimeSecrets.length,
        configuredCount: requiredRuntimeSecrets.length - missingSecrets.length,
        missingNames: missingSecrets,
      },
      external,
      productionMutation: false,
    },
    blockers: uniqueBlockers,
  };

  writeFileSync(options.outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function assert(value, message) {
  if (!value) throw new Error(`self_test_failed:${message}`);
}

function p605Fixture(commit, now) {
  const releaseId = digest('candidate-release');
  return {
    version: 1,
    evidenceId: 'P6-05',
    environment: 'configured_staging',
    state: 'accepted',
    commit,
    generatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 120 * 60_000).toISOString(),
    checks: {
      releases: { status: 'passed', candidate: { releaseId } },
      external: { status: 'passed' },
      finalState: { status: 'passed', activeKind: 'candidate' },
    },
  };
}

function readyExternal(releaseId) {
  return {
    cloudflare: {
      accountConfigured: true,
      project: {
        name: productionProject,
        distinctFromStaging: true,
        accessible: true,
        projectIdDigest: digest('project-id'),
        productionBranchDigest: digest('main'),
      },
      zone: { name: zoneName, exactActiveZoneCount: 1, zoneIdDigest: digest('zone-id') },
      dns: { hostname: productionHostname, recordCount: 1, records: [] },
      customDomain: {
        hostname: productionHostname,
        attachedToCandidateProject: false,
        domainCount: 0,
      },
    },
    intendedDeployment: {
      baseUrl: `https://${productionProject}.pages.dev`,
      markerStatus: 200,
      markerMatches: true,
      expectedReleaseDigest: digest(releaseId),
      observedReleaseDigest: digest(releaseId),
    },
    adminAccess: {
      status: 403,
      cacheControl: 'private, no-store',
      robots: 'noindex, nofollow, noarchive',
      contentOptions: 'nosniff',
      enforced: true,
    },
  };
}

async function selfTest() {
  const root = mkdtempSync(resolve(tmpdir(), 'cpm-p6-013-'));
  const statusRoot = resolve(root, 'status');
  const outputPath = resolve(root, 'receipt.json');
  const commit = 'a'.repeat(40);
  const now = new Date('2026-08-12T00:00:00.000Z');
  const p605 = p605Fixture(commit, now);
  const p605File = resolve(statusRoot, p605Path);
  mkdirSync(resolve(p605File, '..'), { recursive: true });
  writeFileSync(p605File, `${JSON.stringify(p605, null, 2)}\n`);
  const releaseId = p605.checks.releases.candidate.releaseId;
  const allSecrets = Object.fromEntries(requiredRuntimeSecrets.map((key) => [key, true]));
  const base = {
    statusRoot,
    outputPath,
    commit,
    confirmation: exactConfirmation,
    readinessOwner: 'production-readiness-owner',
    repositoryContractOutcome: 'success',
    githubEnvironmentStatus: 'present',
    githubEnvironmentProtectionCount: '1',
    runtimeSecrets: allSecrets,
    externalOverride: readyExternal(releaseId),
    workflowRunId: '3003',
    credentialGenerationId: 'production-generation-v1',
    now,
  };

  try {
    let receipt = await executeProductionReadiness(base);
    assert(receipt.decision === 'ready', 'complete readiness must pass');
    assert(
      receipt.credentialGenerationDigest === digest('production-generation-v1'),
      'readiness must bind production credential generation',
    );
    receipt = await executeProductionReadiness({ ...base, credentialGenerationId: 'short' });
    assert(
      receipt.blockers.includes('credential_generation:invalid'),
      'invalid credential generation must block readiness',
    );
    receipt = await executeProductionReadiness(base);
    assert(receipt.checks.productionMutation === false, 'diagnostic must not mutate production');

    receipt = await executeProductionReadiness({ ...base, githubEnvironmentStatus: 'missing' });
    assert(
      receipt.blockers.includes('github_environment:production_missing'),
      'missing environment must block',
    );

    receipt = await executeProductionReadiness({ ...base, githubEnvironmentProtectionCount: '0' });
    assert(
      receipt.blockers.includes('github_environment:protection_missing'),
      'unprotected environment must block',
    );

    const missingSecret = { ...allSecrets, P6_08_PRODUCTION_DATABASE_URL: false };
    receipt = await executeProductionReadiness({ ...base, runtimeSecrets: missingSecret });
    assert(
      receipt.blockers.includes('runtime_secret:P6_08_PRODUCTION_DATABASE_URL:missing'),
      'missing runtime secret must block',
    );

    const missingProject = structuredClone(base.externalOverride);
    missingProject.cloudflare.project.accessible = false;
    receipt = await executeProductionReadiness({ ...base, externalOverride: missingProject });
    assert(
      receipt.blockers.includes('pages_project:missing_or_inaccessible'),
      'missing project must block',
    );

    const adminUnavailable = structuredClone(base.externalOverride);
    adminUnavailable.adminAccess = {
      status: 503,
      cacheControl: 'private, no-store',
      robots: 'noindex, nofollow, noarchive',
      contentOptions: 'nosniff',
      enforced: false,
    };
    receipt = await executeProductionReadiness({ ...base, externalOverride: adminUnavailable });
    assert(
      receipt.blockers.includes('admin_access:not_enforced'),
      'Admin 503 must block production readiness',
    );

    const wrongRelease = structuredClone(base.externalOverride);
    wrongRelease.intendedDeployment.markerMatches = false;
    receipt = await executeProductionReadiness({ ...base, externalOverride: wrongRelease });
    assert(
      receipt.blockers.includes('intended_release:not_observed'),
      'wrong intended release must block',
    );

    receipt = await executeProductionReadiness({ ...base, confirmation: 'WRONG' });
    assert(receipt.blockers.includes('confirmation:invalid'), 'wrong confirmation must block');

    console.log('OPS-P6-013 configured production readiness self-test passed.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const [statusRoot, outputPath] = process.argv.slice(2);
  if (!statusRoot || !outputPath) throw new Error('Usage: diagnostic <status-root> <output-path>');
  const receipt = await executeProductionReadiness({
    statusRoot,
    outputPath,
    commit: process.env.APPROVED_COMMIT ?? '',
    confirmation: process.env.CONFIRMATION ?? '',
    readinessOwner: process.env.READINESS_OWNER ?? '',
    repositoryContractOutcome: process.env.REPOSITORY_CONTRACT_OUTCOME ?? 'failed',
    githubEnvironmentStatus: process.env.PRODUCTION_ENVIRONMENT_STATUS ?? 'missing',
    githubEnvironmentProtectionCount: process.env.PRODUCTION_ENVIRONMENT_PROTECTION_COUNT ?? '0',
    workflowRunId: process.env.WORKFLOW_RUN_ID ?? null,
  });
  console.log(`Configured production readiness decision: ${receipt.decision}`);
  if (receipt.blockers.length > 0) console.log(`Blockers: ${receipt.blockers.join(', ')}`);
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) await main();
