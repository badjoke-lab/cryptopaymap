from pathlib import Path

runner_path = Path('scripts/run-ops-p6-002b-configured-staging-p6-07-incident-exercise-final-receipt.mjs')
s = runner_path.read_text()

anchor = '''function safeFailure(error) {
'''
assert anchor in s
helper = '''function p605ReleaseEvidence(predecessors) {
  const receipt = predecessors.find((item) => item.evidenceId === 'P6-05')?.value ?? null;
  const candidateReleaseId = receipt?.checks?.releases?.candidate?.releaseId ?? null;
  const current =
    receipt?.checks?.releases?.status === 'passed' &&
    receipt?.checks?.external?.status === 'passed' &&
    receipt?.checks?.finalState?.status === 'passed' &&
    receipt?.checks?.finalState?.activeKind === 'candidate' &&
    validDigest(candidateReleaseId);
  return {
    state: current ? 'current' : 'failed',
    candidateReleaseId: current ? candidateReleaseId : null,
    candidateReleaseIdDigest: current ? digest(candidateReleaseId) : null,
  };
}

'''
s = s.replace(anchor, helper + anchor, 1)

old = 'async function reverify(binding, fetchImpl) {'
new = 'async function reverify(expectedReleaseId, fetchImpl) {'
assert old in s
s = s.replace(old, new, 1)
old = '  const releaseMatches = response.status === 200 && marker?.releaseId === binding.releaseId;'
new = '  const releaseMatches = response.status === 200 && marker?.releaseId === expectedReleaseId;'
assert old in s
s = s.replace(old, new, 1)
old = '    expectedReleaseDigest: digest(binding.releaseId),'
new = '    expectedReleaseDigest: digest(expectedReleaseId),'
assert old in s
s = s.replace(old, new, 1)

anchor = '''  const q4 = qEvidence(statusRoot, qPaths.q4, 'P6-07-Q4', commit, binding, now, (value) => {
    const checks = value?.checks;
    return (
      checks?.artifact?.status === 'passed' &&
      checks?.targetSafety?.status === 'passed' &&
      checks?.targetSafety?.distinct === true &&
      checks?.restore?.status === 'passed' &&
      checks?.reconciliation?.status === 'passed' &&
      checks?.reconciliation?.privateTablesZeroRows === true &&
      checks?.objectives?.rpo?.status === 'passed' &&
      checks?.objectives?.rto?.status === 'passed' &&
      checks?.disposal?.status === 'passed' &&
      checks?.disposal?.remainingUserObjectCount === 0
    );
  });
'''
assert anchor in s
s = s.replace(anchor, anchor + '  const p6Release = p605ReleaseEvidence(predecessors);\n', 1)

old = '''      q4,
      scenario: {
'''
new = '''      q4,
      p6Release: {
        state: p6Release.state,
        candidateReleaseIdDigest: p6Release.candidateReleaseIdDigest,
      },
      scenario: {
'''
assert old in s
s = s.replace(old, new, 1)

old = '''    if (!bindingMatched || [q1, q2, q3, q4].some((item) => item.state !== 'current')) {
      throw new Error('precondition_failed');
    }
'''
new = '''    if (
      !bindingMatched ||
      [q1, q2, q3, q4].some((item) => item.state !== 'current') ||
      p6Release.state !== 'current'
    ) {
      throw new Error('precondition_failed');
    }
'''
assert old in s
s = s.replace(old, new, 1)

old = '    const external = await reverify(binding, fetchImpl);'
new = '    const external = await reverify(p6Release.candidateReleaseId, fetchImpl);'
assert old in s
s = s.replace(old, new, 1)

old = 'function mockFetch(binding, wrongRelease = false) {'
new = 'function mockFetch(expectedReleaseId, wrongRelease = false) {'
assert old in s
s = s.replace(old, new, 1)
old = "        JSON.stringify({ releaseId: wrongRelease ? digest('wrong') : binding.releaseId }),"
new = "        JSON.stringify({ releaseId: wrongRelease ? digest('wrong') : expectedReleaseId }),"
assert old in s
s = s.replace(old, new, 1)

old = "  const binding = Object.fromEntries(bindingKeys.map((key) => [key, digest(`q5:${key}`)]));\n  let tick = now.getTime();"
new = "  const binding = Object.fromEntries(bindingKeys.map((key) => [key, digest(`q5:${key}`)]));\n  const candidateReleaseId = digest('q5:p6-05-candidate-release');\n  let tick = now.getTime();"
assert old in s
s = s.replace(old, new, 1)
old = '    fetchImpl: mockFetch(binding),'
new = '    fetchImpl: mockFetch(candidateReleaseId),'
assert old in s
s = s.replace(old, new, 1)

old = '''    for (const [id, path] of predecessorSpecs) {
      writeJson(resolve(statusRoot, path), fixtureReceipt(id, commit, binding, now));
    }
'''
new = '''    for (const [id, path] of predecessorSpecs) {
      const extra =
        id === 'P6-05'
          ? {
              checks: {
                releases: { status: 'passed', candidate: { releaseId: candidateReleaseId } },
                external: { status: 'passed' },
                finalState: { status: 'passed', activeKind: 'candidate' },
              },
            }
          : {};
      writeJson(resolve(statusRoot, path), fixtureReceipt(id, commit, binding, now, extra));
    }
'''
assert old in s
s = s.replace(old, new, 1)

old = "    assert(receipt.checks.externalReverification.status === 'passed', 'external checks must pass');\n"
new = "    assert(receipt.checks.externalReverification.status === 'passed', 'external checks must pass');\n    assert(receipt.checks.p6Release.state === 'current', 'P6-05 candidate release must be current');\n"
assert old in s
s = s.replace(old, new, 1)

old = '      fetchImpl: mockFetch(binding, true),'
new = '      fetchImpl: mockFetch(candidateReleaseId, true),'
assert old in s
s = s.replace(old, new, 1)

anchor = '''    assert(receipt.state === 'failed', 'wrong release must fail');
    const q4 = readJson(statusRoot, qPaths.q4);
'''
assert anchor in s
addition = '''    assert(receipt.state === 'failed', 'wrong release must fail');
    const p605Path = predecessorSpecs.find(([id]) => id === 'P6-05')[1];
    const p605 = readJson(statusRoot, p605Path);
    p605.checks.releases.candidate.releaseId = 'invalid-release-id';
    writeJson(resolve(statusRoot, p605Path), p605);
    receipt = await executeQ5({
      ...base,
      incidentId: 'cpm-p6-07-q5-invalid-p6-05-release',
    });
    assert(receipt.exceptions.includes('precondition_failed'), 'invalid P6-05 release must fail');
    p605.checks.releases.candidate.releaseId = candidateReleaseId;
    writeJson(resolve(statusRoot, p605Path), p605);
    const q4 = readJson(statusRoot, qPaths.q4);
'''
s = s.replace(anchor, addition, 1)
runner_path.write_text(s)

checker_path = Path('scripts/check-ops-p6-002b-configured-staging-p6-07-incident-exercise-final-receipt.mjs')
s = checker_path.read_text()
anchor = "  'p6-05-release.json',\n"
assert anchor in s
s = s.replace(
    anchor,
    anchor
    + "  'p605releaseevidence',\n"
    + "  'candidatereleaseiddigest',\n"
    + "  'expectedreleaseid',\n"
    + "  \"activekind === 'candidate'\",\n",
    1,
)
checker_path.write_text(s)

doc_path = Path('docs/OPS_P6_002B_CONFIGURED_STAGING_P6_07_INCIDENT_EXERCISE_FINAL_RECEIPT.md')
s = doc_path.read_text()
old = '''- `/p6-05-release.json` matching the intended active-release identity, not HTTP status alone.

Service and release identity must be externally reverified before closure.
'''
new = '''- `/p6-05-release.json` matching the exact candidate release ID retained by the current accepted P6-05 receipt, not HTTP status alone.

The shared predecessor `binding.releaseId` remains part of the cross-evidence binding and is not the P6-05 deployment marker ID. Q5 separately requires P6-05 to prove `releases.status: passed`, `external.status: passed`, `finalState.status: passed`, `finalState.activeKind: candidate`, and a valid candidate release ID before using that exact ID for live marker reverification.

Service and release identity must be externally reverified before closure.
'''
assert old in s
s = s.replace(old, new, 1)
old = '- wrong active release despite HTTP 200;'
new = '- missing or invalid accepted P6-05 candidate-release evidence, or a wrong live active release despite HTTP 200;'
assert old in s
s = s.replace(old, new, 1)
doc_path.write_text(s)
