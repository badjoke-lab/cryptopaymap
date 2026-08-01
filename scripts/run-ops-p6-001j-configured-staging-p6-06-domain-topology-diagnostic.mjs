import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const exactConfirmation = 'DIAGNOSE_CONFIGURED_STAGING_P6_06';
const evidenceId = 'P6-06-DIAGNOSTIC';
const projectName = 'cryptopaymap-staging';
const productionBranch = 'staging-review';
const expiryHours = 72;
const bindingKeys = ['releaseId', 'dataSnapshotId', 'configurationId', 'environmentId'];
const predecessorPaths = [
  ['P6-01', 'config/staging-authorization/p6-01-data-qa-receipt.json'],
  ['P6-02', 'config/staging-authorization/p6-02-identity-admin-receipt.json'],
  ['P6-03', 'config/staging-authorization/p6-03-neon-transaction-receipt.json'],
  ['P6-04', 'config/staging-authorization/p6-04-r2-media-lifecycle-receipt.json'],
  ['P6-05', 'config/staging-authorization/p6-05-public-export-release-receipt.json'],
];

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
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

function validZoneId(value) {
  return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
}

function safeTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function normalizeHostname(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\.$/, '') : null;
}

function ttlClass(value) {
  if (!Number.isInteger(value) || value < 1) return 'unknown';
  if (value === 1) return 'automatic';
  if (value <= 300) return 'at_most_5m';
  if (value <= 3600) return 'at_most_1h';
  return 'over_1h';
}

function safeError(error) {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/[^a-zA-Z0-9:_./-]/g, '_').slice(0, 160);
}

function readPredecessor(statusRoot, expectedEvidenceId, relativePath, commit, now) {
  let receipt = null;
  try {
    const value = JSON.parse(readFileSync(resolve(statusRoot, relativePath), 'utf8'));
    receipt = isObject(value) ? value : null;
  } catch {
    receipt = null;
  }
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
  };
}

function sharedBinding(predecessors) {
  if (predecessors.some((item) => item.state !== 'current' || item.binding === null)) return null;
  const first = JSON.stringify(predecessors[0].binding);
  return predecessors.every((item) => JSON.stringify(item.binding) === first)
    ? predecessors[0].binding
    : null;
}

class CloudflareApiError extends Error {
  constructor(label, status, codes) {
    super(`${label}:${status}:${codes.length > 0 ? codes.join(',') : 'unknown'}`);
    this.name = 'CloudflareApiError';
    this.status = status;
    this.codes = codes;
  }
}

async function cloudflareRequest(path, label) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('cloudflare_token_missing');
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!response.ok || body?.success !== true) {
    const codes = Array.isArray(body?.errors)
      ? body.errors.map((item) => item?.code).filter((value) => Number.isInteger(value))
      : [];
    throw new CloudflareApiError(label, response.status, codes);
  }
  return { result: body.result, resultInfo: body.result_info ?? null };
}

async function listZones(accountId) {
  const encoded = encodeURIComponent(accountId);
  const { result } = await cloudflareRequest(
    `/zones?account.id=${encoded}&status=active&per_page=50&page=1`,
    'zones_list',
  );
  return Array.isArray(result) ? result : [];
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

function classifyTopology({ project, zones, records, dnsReadable, zoneSafe = true }) {
  const platformDomain = `${projectName}.pages.dev`;
  const projectDomains = Array.isArray(project?.domains)
    ? project.domains.map(normalizeHostname).filter(Boolean)
    : [];
  const customDomains = projectDomains.filter((domain) => domain !== platformDomain);
  const platformDomainPresent = projectDomains.includes(platformDomain);
  const platformDomainMatches = normalizeHostname(project?.subdomain) === platformDomain;
  const projectSafe =
    project?.name === projectName &&
    project?.production_branch === productionBranch &&
    platformDomainPresent &&
    platformDomainMatches;

  const customDomainSet = new Set(customDomains);
  const candidateRecords = records.filter((record) => {
    const name = normalizeHostname(record?.name);
    const target = normalizeHostname(record?.content);
    return (name !== null && customDomainSet.has(name)) || target === platformDomain;
  });

  let decision = 'ambiguous';
  if (!projectSafe || !zoneSafe) decision = 'unsafe_topology';
  else if (!dnsReadable) decision = 'permission_blocked';
  else if (customDomains.length === 0 && candidateRecords.length === 0) decision = 'no_candidate';
  else if (
    customDomains.length === 1 &&
    candidateRecords.length === 1 &&
    normalizeHostname(candidateRecords[0]?.name) === customDomains[0]
  ) {
    decision = 'existing_candidate_requires_approval';
  }

  const zoneById = new Map(
    zones
      .filter((zone) => typeof zone?.id === 'string')
      .map((zone) => [zone.id, normalizeHostname(zone?.name)]),
  );

  const candidates = candidateRecords.slice(0, 20).map((record) => ({
    hostnameHash: boundedHash(normalizeHostname(record?.name) ?? 'missing'),
    zoneHash: boundedHash(zoneById.get(record?.zone_id) ?? 'unknown-zone'),
    targetHash: boundedHash(normalizeHostname(record?.content) ?? 'missing'),
    recordType: typeof record?.type === 'string' ? record.type.slice(0, 16) : null,
    proxied: typeof record?.proxied === 'boolean' ? record.proxied : null,
    ttlClass: ttlClass(record?.ttl),
  }));

  return {
    decision,
    projectSafe,
    zoneSafe,
    platformDomainPresent,
    platformDomainMatches,
    customDomainCount: customDomains.length,
    candidateCount: candidateRecords.length,
    candidates,
  };
}

async function runDiagnostic(statusRoot, outputPath) {
  const now = new Date();
  const commit = process.env.APPROVED_COMMIT;
  const owner = process.env.DOMAIN_OWNER;
  const confirmation = process.env.CONFIRMATION;
  const repositoryContract = process.env.REPOSITORY_CONTRACT_OUTCOME === 'success';
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const expectedZoneId = process.env.P6_06_STAGING_ZONE_ID;
  const predecessors = validCommit(commit)
    ? predecessorPaths.map(([id, path]) => readPredecessor(statusRoot, id, path, commit, now))
    : predecessorPaths.map(([id, path]) => ({
        evidenceId: id,
        path,
        state: 'failed',
        generatedAt: null,
        expiresAt: null,
        binding: null,
      }));
  const binding = sharedBinding(predecessors);
  const exceptions = [];
  const permissions = {
    tokenVerify: 'not_run',
    pagesProject: 'not_run',
    zoneList: 'not_run',
    dnsList: 'not_run',
  };
  const checks = {
    exactMain: validCommit(commit) ? 'success' : 'failed',
    confirmation: confirmation === exactConfirmation ? 'success' : 'failed',
    owner: validOperator(owner) ? 'success' : 'failed',
    repositoryContract: repositoryContract ? 'success' : 'failed',
    predecessors: predecessors.map(({ binding: _binding, ...item }) => item),
    predecessorBinding: binding === null ? 'failed' : 'matched',
    permissions,
    topology: {
      productionBranch: null,
      platformDomainPresent: false,
      platformDomainMatches: false,
      projectSafe: false,
      zoneMatchesExpected: false,
    },
    inventory: {
      activeZoneCount: 0,
      selectedZoneCount: 0,
      dnsRecordCount: 0,
      projectCustomDomainCount: 0,
      successfulProductionDeploymentCount: 0,
      candidateCount: 0,
      candidateDigest: null,
      deploymentDigest: null,
    },
  };

  const preconditions =
    checks.exactMain === 'success' &&
    checks.confirmation === 'success' &&
    checks.owner === 'success' &&
    checks.repositoryContract === 'success' &&
    predecessors.every((item) => item.state === 'current') &&
    binding !== null &&
    typeof accountId === 'string' &&
    accountId.length > 0 &&
    typeof token === 'string' &&
    token.length > 0 &&
    validZoneId(expectedZoneId);

  let state = 'failed';
  let decision = 'permission_blocked';
  if (!preconditions) {
    exceptions.push('preconditions:failed');
  } else {
    try {
      await cloudflareRequest('/user/tokens/verify', 'token_verify');
      permissions.tokenVerify = 'success';

      const { result: project } = await cloudflareRequest(
        `/accounts/${encodeURIComponent(accountId)}/pages/projects/${projectName}`,
        'pages_project_get',
      );
      permissions.pagesProject = 'success';

      let deployments = [];
      try {
        const response = await cloudflareRequest(
          `/accounts/${encodeURIComponent(accountId)}/pages/projects/${projectName}/deployments?env=production`,
          'pages_deployments_list',
        );
        deployments = Array.isArray(response.result)
          ? response.result.filter((item) => item?.latest_stage?.status === 'success')
          : [];
      } catch (error) {
        exceptions.push(`deployments:${safeError(error)}`);
      }

      let zones = [];
      let selectedZones = [];
      const records = [];
      let dnsReadable = true;
      let zoneSafe = false;
      try {
        zones = await listZones(accountId);
        selectedZones = zones.filter((zone) => zone?.id === expectedZoneId);
        zoneSafe = selectedZones.length === 1;
        permissions.zoneList = 'success';
      } catch (error) {
        permissions.zoneList = 'failed';
        permissions.dnsList = 'failed';
        dnsReadable = false;
        exceptions.push(`zones:${safeError(error)}`);
      }

      if (dnsReadable && zoneSafe) {
        for (const zone of selectedZones) {
          if (typeof zone?.id !== 'string') continue;
          try {
            const zoneRecords = await listDnsRecords(zone.id);
            records.push(...zoneRecords);
          } catch (error) {
            dnsReadable = false;
            exceptions.push(`dns:${safeError(error)}`);
            break;
          }
        }
        permissions.dnsList = dnsReadable ? 'success' : 'failed';
      }

      const classification = classifyTopology({
        project,
        zones: selectedZones,
        records,
        dnsReadable,
        zoneSafe,
      });
      decision = classification.decision;
      checks.topology = {
        productionBranch: project?.production_branch ?? null,
        platformDomainPresent: classification.platformDomainPresent,
        platformDomainMatches: classification.platformDomainMatches,
        projectSafe: classification.projectSafe,
        zoneMatchesExpected: classification.zoneSafe,
      };
      const projectDomains = Array.isArray(project?.domains)
        ? project.domains.map(normalizeHostname).filter(Boolean)
        : [];
      const platformDomain = `${projectName}.pages.dev`;
      const customDomainCount = projectDomains.filter((domain) => domain !== platformDomain).length;
      checks.inventory = {
        activeZoneCount: zones.length,
        selectedZoneCount: selectedZones.length,
        dnsRecordCount: records.length,
        projectCustomDomainCount: customDomainCount,
        successfulProductionDeploymentCount: deployments.length,
        candidateCount: classification.candidateCount,
        candidateDigest: boundedHash(JSON.stringify(classification.candidates)),
        deploymentDigest: boundedHash(
          JSON.stringify(deployments.map((item) => boundedHash(item?.id ?? 'missing')).sort()),
        ),
      };
      state = 'diagnosed';
    } catch (error) {
      exceptions.push(`execution:${safeError(error)}`);
    }
  }

  const generatedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000).toISOString();
  const receipt = {
    version: 1,
    evidenceId,
    environment: 'configured_staging',
    state,
    decision,
    commit: validCommit(commit) ? commit : null,
    generatedAt,
    expiresAt,
    workflowRunId: process.env.WORKFLOW_RUN_ID ?? null,
    owner: validOperator(owner) ? boundedHash(owner.trim()) : null,
    checks,
    ...(binding === null ? {} : { binding }),
    exceptions: [...new Set(exceptions)].sort(),
  };
  mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(resolve(outputPath), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`OPS-P6-001J diagnostic state: ${state}; decision: ${decision}`);
  if (state !== 'diagnosed') process.exitCode = 1;
}

function writeFixture(root, relativePath, value) {
  const absolutePath = resolve(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Self-test failed: ${message}`);
}

function runSelfTest() {
  const platformDomain = `${projectName}.pages.dev`;
  const project = {
    name: projectName,
    production_branch: productionBranch,
    subdomain: platformDomain,
    domains: [platformDomain],
  };
  let result = classifyTopology({ project, zones: [], records: [], dnsReadable: true });
  assert(result.decision === 'no_candidate', 'empty safe topology must have no candidate');

  const customHost = 'p6-06.example.invalid';
  result = classifyTopology({
    project: { ...project, domains: [platformDomain, customHost] },
    zones: [{ id: 'zone-1', name: 'example.invalid' }],
    records: [
      {
        zone_id: 'zone-1',
        name: customHost,
        content: platformDomain,
        type: 'CNAME',
        proxied: true,
        ttl: 1,
      },
    ],
    dnsReadable: true,
  });
  assert(
    result.decision === 'existing_candidate_requires_approval',
    'one exact custom-domain record must be a candidate',
  );
  assert(result.candidates.length === 1, 'one candidate must be retained');
  assert(!JSON.stringify(result).includes(customHost), 'raw hostname must not be retained');

  result = classifyTopology({ project, zones: [], records: [], dnsReadable: false });
  assert(result.decision === 'permission_blocked', 'unreadable DNS must block');

  result = classifyTopology({
    project,
    zones: [],
    records: [],
    dnsReadable: true,
    zoneSafe: false,
  });
  assert(result.decision === 'unsafe_topology', 'missing expected zone must be unsafe');

  const root = mkdtempSync(join(tmpdir(), 'cpm-p6-06-diagnostic-self-test-'));
  try {
    const commit = 'a'.repeat(40);
    const binding = Object.fromEntries(bindingKeys.map((key) => [key, boundedHash(key)]));
    for (const [id, path] of predecessorPaths) {
      writeFixture(root, path, {
        version: 1,
        evidenceId: id,
        environment: 'configured_staging',
        state: 'accepted',
        commit,
        generatedAt: '2026-08-01T00:00:00.000Z',
        expiresAt: '2026-08-04T00:00:00.000Z',
        binding,
      });
    }
    const predecessors = predecessorPaths.map(([id, path]) =>
      readPredecessor(root, id, path, commit, new Date('2026-08-02T00:00:00.000Z')),
    );
    assert(sharedBinding(predecessors) !== null, 'current predecessors must share binding');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log('OPS-P6-001J configured staging P6-06 diagnostic self-test passed.');
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
  } else {
    const statusRoot = process.argv[2];
    const outputPath = process.argv[3];
    if (!statusRoot || !outputPath || !existsSync(statusRoot)) {
      throw new Error('Usage: node script <status-root> <output-path>');
    }
    await runDiagnostic(statusRoot, outputPath);
  }
}

export { classifyTopology, runDiagnostic };
