from pathlib import Path

RUNNER = Path('scripts/run-ops-p6-001j-configured-staging-p6-06-domain-topology-diagnostic.mjs')
CHECKER = Path('scripts/check-ops-p6-001j-configured-staging-p6-06-domain-topology-diagnostic.mjs')
DOC = Path('docs/OPS_P6_001J_CONFIGURED_STAGING_P6_06_DOMAIN_TOPOLOGY_DIAGNOSTIC.md')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


runner = RUNNER.read_text()

runner = replace_once(
    runner,
    "const expiryHours = 72;\nconst bindingKeys = ['releaseId', 'dataSnapshotId', 'configurationId', 'environmentId'];",
    "const expiryHours = 72;\nconst approvedStagingCustomDomain = 'staging.cryptopaymap.com';\nconst priorP606ReceiptPath =\n  'config/staging-authorization/p6-06-domain-cutover-rollback-receipt.json';\nconst bindingKeys = ['releaseId', 'dataSnapshotId', 'configurationId', 'environmentId'];",
    'runner constants',
)

old_shared = """function sharedBinding(predecessors) {
  if (predecessors.some((item) => item.state !== 'current' || item.binding === null)) return null;
  const first = JSON.stringify(predecessors[0].binding);
  return predecessors.every((item) => JSON.stringify(item.binding) === first)
    ? predecessors[0].binding
    : null;
}
"""
new_shared = old_shared + """
function readHistoricalP606Proof(statusRoot) {
  let receipt = null;
  try {
    const value = JSON.parse(readFileSync(resolve(statusRoot, priorP606ReceiptPath), 'utf8'));
    receipt = isObject(value) ? value : null;
  } catch {
    receipt = null;
  }
  const generatedAt = safeTimestamp(receipt?.generatedAt);
  const expiresAt = safeTimestamp(receipt?.expiresAt);
  const proofValid =
    receipt?.version === 1 &&
    receipt?.evidenceId === 'P6-06' &&
    receipt?.environment === 'configured_staging' &&
    receipt?.state === 'accepted' &&
    validCommit(receipt?.commit) &&
    generatedAt !== null &&
    expiresAt !== null &&
    receipt?.checks?.hostname?.digest === boundedHash(approvedStagingCustomDomain) &&
    ['passed', 'existing'].includes(receipt?.checks?.cutover?.status) &&
    receipt?.checks?.externalCutover?.status === 'passed' &&
    receipt?.checks?.rollback?.status === 'passed' &&
    receipt?.checks?.externalRollback?.status === 'passed' &&
    receipt?.checks?.finalRestore?.status === 'passed' &&
    receipt?.checks?.externalFinal?.status === 'passed' &&
    Array.isArray(receipt?.exceptions) &&
    receipt.exceptions.length === 0;
  return {
    state: proofValid ? 'authenticated_historical_proof' : receipt === null ? 'missing' : 'failed',
    generatedAt,
    expiresAt,
    digest: proofValid ? boundedHash(JSON.stringify(receipt)) : null,
  };
}

function selectPrerequisites(predecessors, historicalP606) {
  const fullBinding = sharedBinding(predecessors);
  if (predecessors.every((item) => item.state === 'current') && fullBinding !== null) {
    return { mode: 'normal', binding: fullBinding };
  }

  const foundational = predecessors.filter((item) => item.evidenceId !== 'P6-05');
  const p605 = predecessors.find((item) => item.evidenceId === 'P6-05');
  const recoveryBinding = sharedBinding(foundational);
  const recoveryEligible =
    foundational.length === 4 &&
    foundational.every((item) => item.state === 'current') &&
    recoveryBinding !== null &&
    p605 !== undefined &&
    ['missing', 'stale', 'failed'].includes(p605.state) &&
    historicalP606.state === 'authenticated_historical_proof';
  return recoveryEligible
    ? { mode: 'p6_05_expiry_recovery', binding: recoveryBinding }
    : { mode: 'failed', binding: null };
}
"""
runner = replace_once(runner, old_shared, new_shared, 'runner prerequisite helpers')

runner = replace_once(
    runner,
    """  const binding = sharedBinding(predecessors);
  const exceptions = [];
""",
    """  const historicalP606 = validCommit(commit)
    ? readHistoricalP606Proof(statusRoot)
    : { state: 'failed', generatedAt: null, expiresAt: null, digest: null };
  const prerequisites = selectPrerequisites(predecessors, historicalP606);
  const binding = prerequisites.binding;
  const exceptions = [];
""",
    'runner prerequisite selection',
)

runner = replace_once(
    runner,
    """    predecessors: predecessors.map(({ binding: _binding, ...item }) => item),
    predecessorBinding: binding === null ? 'failed' : 'matched',
    permissions,
""",
    """    predecessors: predecessors.map(({ binding: _binding, ...item }) => item),
    predecessorBinding: binding === null ? 'failed' : 'matched',
    prerequisiteMode: prerequisites.mode,
    historicalP606: {
      state: historicalP606.state,
      generatedAt: historicalP606.generatedAt,
      expiresAt: historicalP606.expiresAt,
      digest: historicalP606.digest,
    },
    permissions,
""",
    'runner retained audit mode',
)

runner = replace_once(
    runner,
    """    checks.repositoryContract === 'success' &&
    predecessors.every((item) => item.state === 'current') &&
    binding !== null &&
""",
    """    checks.repositoryContract === 'success' &&
    prerequisites.mode !== 'failed' &&
    binding !== null &&
""",
    'runner preconditions',
)

runner = replace_once(
    runner,
    """    assert(sharedBinding(predecessors) !== null, 'current predecessors must share binding');
  } finally {
""",
    """    assert(sharedBinding(predecessors) !== null, 'current predecessors must share binding');
    const normal = selectPrerequisites(predecessors, { state: 'missing' });
    assert(normal.mode === 'normal', 'normal path must require current P6-01 through P6-05');

    const p605Path = predecessorPaths.find(([id]) => id === 'P6-05')[1];
    const p605 = JSON.parse(readFileSync(resolve(root, p605Path), 'utf8'));
    p605.state = 'failed';
    writeFixture(root, p605Path, p605);
    writeFixture(root, priorP606ReceiptPath, {
      version: 1,
      evidenceId: 'P6-06',
      environment: 'configured_staging',
      state: 'accepted',
      commit: 'b'.repeat(40),
      generatedAt: '2026-07-31T00:00:00.000Z',
      expiresAt: '2026-08-01T00:00:00.000Z',
      checks: {
        hostname: { digest: boundedHash(approvedStagingCustomDomain) },
        cutover: { status: 'existing' },
        externalCutover: { status: 'passed' },
        rollback: { status: 'passed' },
        externalRollback: { status: 'passed' },
        finalRestore: { status: 'passed' },
        externalFinal: { status: 'passed' },
      },
      exceptions: [],
    });
    const recoveryPredecessors = predecessorPaths.map(([id, path]) =>
      readPredecessor(root, id, path, commit, new Date('2026-08-02T00:00:00.000Z')),
    );
    const historical = readHistoricalP606Proof(root);
    assert(
      historical.state === 'authenticated_historical_proof',
      'expired accepted P6-06 may authenticate only as historical proof',
    );
    const recovery = selectPrerequisites(recoveryPredecessors, historical);
    assert(
      recovery.mode === 'p6_05_expiry_recovery',
      'failed P6-05 may enter only the bounded read-only recovery path',
    );
    assert(recovery.binding !== null, 'recovery must preserve the P6-01 through P6-04 binding');
    assert(
      selectPrerequisites(recoveryPredecessors, { state: 'missing' }).mode === 'failed',
      'recovery must fail without authenticated historical P6-06 proof',
    );

    const p604Path = predecessorPaths.find(([id]) => id === 'P6-04')[1];
    const p604 = JSON.parse(readFileSync(resolve(root, p604Path), 'utf8'));
    p604.binding.releaseId = boundedHash('different-release');
    writeFixture(root, p604Path, p604);
    const brokenBinding = predecessorPaths.map(([id, path]) =>
      readPredecessor(root, id, path, commit, new Date('2026-08-02T00:00:00.000Z')),
    );
    assert(
      selectPrerequisites(brokenBinding, historical).mode === 'failed',
      'recovery must fail when P6-01 through P6-04 do not share one binding',
    );
  } finally {
""",
    'runner self-test recovery cases',
)

RUNNER.write_text(runner)

checker = CHECKER.read_text()
checker = replace_once(
    checker,
    """  [files.executor, 'raw hostname must not be retained'],
""",
    """  [files.executor, 'raw hostname must not be retained'],
  [files.executor, "const approvedStagingCustomDomain = 'staging.cryptopaymap.com'"],
  [files.executor, 'function readHistoricalP606Proof(statusRoot)'],
  [files.executor, "state: proofValid ? 'authenticated_historical_proof'"],
  [files.executor, "mode: 'p6_05_expiry_recovery'"],
  [files.executor, 'prerequisiteMode: prerequisites.mode'],
  [files.executor, "prerequisites.mode !== 'failed'"],
""",
    'checker recovery expectations',
)
checker = replace_once(
    checker,
    """if (!files.executor.includes("predecessors.every((item) => item.state === 'current')")) {
  throw new Error('OPS-P6-001J must require current P6-01 through P6-05 receipts.');
}
""",
    """if (!files.executor.includes("predecessors.every((item) => item.state === 'current')")) {
  throw new Error('OPS-P6-001J normal mode must require current P6-01 through P6-05 receipts.');
}
if (!files.executor.includes("foundational.every((item) => item.state === 'current')")) {
  throw new Error('OPS-P6-001J recovery mode must require current P6-01 through P6-04 receipts.');
}
if (!files.executor.includes("historicalP606.state === 'authenticated_historical_proof'")) {
  throw new Error('OPS-P6-001J recovery mode must require authenticated historical P6-06 proof.');
}
""",
    'checker prerequisite contract',
)
CHECKER.write_text(checker)

doc = DOC.read_text()
doc = replace_once(
    doc,
    """- current accepted P6-01 through P6-05 receipts on the same commit;
- one matching release/data/configuration/environment binding;
""",
    """- normal execution: current accepted P6-01 through P6-05 receipts on the same commit;
- bounded P6-05 expiry recovery: current accepted P6-01 through P6-04 receipts on the same commit, a non-current P6-05 receipt, and one authenticated historical P6-06 accepted receipt;
- one matching release/data/configuration/environment binding across every current predecessor required by the selected mode;
""",
    'doc exact-main modes',
)
doc = replace_once(
    doc,
    """A changed main commit, stale predecessor, mismatched binding, missing credential, or unexpected Pages project stops the diagnostic.
""",
    """A changed main commit, a stale P6-01 through P6-04 predecessor, mismatched binding, missing credential, invalid historical P6-06 proof, or unexpected Pages project stops the diagnostic. P6-05 may be non-current only in the bounded expiry-recovery mode. Historical P6-06 evidence is authentication material for a read-only recheck and is never treated as current P6-06 authorization.
""",
    'doc fail-closed recovery boundary',
)
doc = replace_once(
    doc,
    """The retained diagnostic may include only:

- exact source commit, timestamps, and expiry;
""",
    """The retained diagnostic may include only:

- exact source commit, timestamps, and expiry;
- the prerequisite mode (`normal` or `p6_05_expiry_recovery`) and a bounded digest/state for historical P6-06 proof when recovery mode is used;
""",
    'doc retained recovery evidence',
)
DOC.write_text(doc)

print('OPS-P6-004 bounded P6-06 diagnostic recovery patch applied.')
