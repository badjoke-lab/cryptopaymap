from pathlib import Path

path = Path('scripts/run-ops-p6-016-production-go-live-executor.mjs')
text = path.read_text()
old = "  const authorizationExpires = safeTimestamp(authorization?.expiresAt);\n  const candidateExpires = safeTimestamp(candidate?.expiresAt);"
new = "  const authorizationGenerated = safeTimestamp(authorization?.generatedAt);\n  const authorizationExpires = safeTimestamp(authorization?.expiresAt);\n  const executionWindowMinutes = authorization?.checks?.executionWindow?.minutes;\n  const executionWindowEnds =\n    authorizationGenerated !== null &&\n    Number.isInteger(executionWindowMinutes) &&\n    executionWindowMinutes >= 5 &&\n    executionWindowMinutes <= 60\n      ? Date.parse(authorizationGenerated) + executionWindowMinutes * 60_000\n      : null;\n  const candidateExpires = safeTimestamp(candidate?.expiresAt);"
if old not in text: raise SystemExit('authorization timing anchor missing')
text = text.replace(old, new, 1)
old = "    authorizationExpires !== null &&\n    Date.parse(authorizationExpires) > now.getTime() &&\n    authorization?.checks?.productionMutation === false &&"
new = "    authorizationGenerated !== null &&\n    authorizationExpires !== null &&\n    Date.parse(authorizationExpires) > now.getTime() &&\n    executionWindowEnds !== null &&\n    executionWindowEnds > now.getTime() &&\n    authorization?.checks?.executionWindow?.status === 'passed' &&\n    authorization?.checks?.productionMutation === false &&"
if old not in text: raise SystemExit('authorization current timing anchor missing')
text = text.replace(old, new, 1)
old = "  if (!authorizationCurrent) blockers.push('production_authorization:not_current');\n\n  const candidateCurrent ="
new = "  if (!authorizationCurrent) blockers.push('production_authorization:not_current');\n  if (authorizationGenerated !== null && executionWindowEnds !== null && executionWindowEnds <= now.getTime())\n    blockers.push('execution_window:expired');\n\n  const candidateCurrent ="
if old not in text: raise SystemExit('execution window blocker anchor missing')
text = text.replace(old, new, 1)
old = "      checks: {\n        productionCandidateBootstrap: { state: 'current_accepted' },"
new = "      checks: {\n        executionWindow: { status: 'passed', minutes: 30 },\n        productionCandidateBootstrap: { state: 'current_accepted' },"
if old not in text: raise SystemExit('self-test authorization checks anchor missing')
text = text.replace(old, new, 1)
old = "    assert(evidence.blockers.length === 0, 'valid evidence bundle must pass');\n    evidence = readEvidenceBundle("
new = "    assert(evidence.blockers.length === 0, 'valid evidence bundle must pass');\n    const expiredAuthorization = {\n      ...authorizationReceipt,\n      generatedAt: new Date(now.getTime() - 31 * 60_000).toISOString(),\n      expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),\n    };\n    writeJson(resolve(statusRoot, authorizationPath), expiredAuthorization);\n    evidence = readEvidenceBundle(statusRoot, commit, authorizationId, executionOwner, rollbackOwner, now);\n    assert(evidence.blockers.includes('execution_window:expired'), 'expired execution window must fail closed');\n    writeJson(resolve(statusRoot, authorizationPath), authorizationReceipt);\n    evidence = readEvidenceBundle("
if old not in text: raise SystemExit('self-test execution window anchor missing')
text = text.replace(old, new, 1)
path.write_text(text)
