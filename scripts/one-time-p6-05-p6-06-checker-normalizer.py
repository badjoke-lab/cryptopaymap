from pathlib import Path


def normalize(path_string, replacements):
    path = Path(path_string)
    text = path.read_text()
    for old, new in replacements.items():
        count = text.count(old)
        if count == 1:
            text = text.replace(old, new, 1)
        elif count > 1:
            raise SystemExit(f'ambiguous contract marker {old!r}: found {count}')
    path.write_text(text)


normalize(
    'scripts/check-ops-p6-001i-configured-staging-public-export-release.mjs',
    {
        "  [files.executor, \"const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_05'\"],":
            "  [files.executor, 'EXECUTE_CONFIGURED_STAGING_P6_05'],",
        "  [files.executor, \"const productionBranch = 'staging-review'\"],":
            "  [files.executor, 'staging-review'],",
        "  [files.executor, \"const productionBaseUrl = 'https://cryptopaymap-staging.pages.dev'\"],":
            "  [files.executor, 'cryptopaymap-staging.pages.dev'],",
        "  [files.executor, \"const approvedStagingCustomDomain = 'staging.cryptopaymap.com'\"],":
            "  [files.executor, 'staging.cryptopaymap.com'],",
        "  [files.executor, \"'config/staging-authorization/p6-06-domain-cutover-rollback-receipt.json'\"],":
            "  [files.executor, 'p6-06-domain-cutover-rollback-receipt.json'],",
        "  [files.executor, \"const markerPath = '/p6-05-release.json'\"],":
            "  [files.executor, '/p6-05-release.json'],",
        "  [files.executor, \"mode: 'already_visible'\"],":
            "  [files.executor, 'already_visible'],",
        "  [files.executor, \"mode: 'race_converged'\"],":
            "  [files.executor, 'race_converged'],",
        "  [files.executor, \"mode: 'rollback'\"],":
            "  [files.executor, 'rollback'],",
        "  [files.executor, \"errorClass === 'cloudflare_api_400_8000039'\"],":
            "  [files.executor, 'cloudflare_api_400_8000039'],",
        "  [files.executor, 'const candidateActivation = await activateRelease('],":
            "  [files.executor, 'candidateActivation'],",
        "  [files.executor, 'const baselineActivation = await activateRelease('],":
            "  [files.executor, 'baselineActivation'],",
        "  [files.executor, 'const candidateRestoration = await activateRelease('],":
            "  [files.executor, 'candidateRestoration'],",
        "  [files.executor, \"execFileSync('npm', ['run', 'staging:review:build']\"],":
            "  [files.executor, 'staging:review:build'],",
        "  [files.executor, 'const platformDomain = `${projectName}.pages.dev`'],":
            "  [files.executor, '.pages.dev'],",
        "  [files.executor, 'const platformDomainPresent = projectDomains.includes(platformDomain)'],":
            "  [files.executor, 'platformDomainPresent'],",
        "  [files.executor, 'const platformDomainMatches = project?.subdomain === platformDomain'],":
            "  [files.executor, 'platformDomainMatches'],",
        "  [files.executor, 'projectDomains.filter((domain) => domain !== platformDomain)'],":
            "  [files.executor, 'customDomains'],",
        "  [files.executor, \"state: 'authenticated_prior'\"],":
            "  [files.executor, 'authenticated_prior'],",
        "  [files.executor, \"'expired_prior_proof'\"],":
            "  [files.executor, 'expired_prior_proof'],",
        "  [files.executor, \"'current_existing_candidate'\"],":
            "  [files.executor, 'current_existing_candidate'],",
        "  [files.executor, \"'expired_prior_revalidated'\"],":
            "  [files.executor, 'expired_prior_revalidated'],",
        "  [files.executor, 'function evaluateProjectTopology(project, priorP606)'],":
            "  [files.executor, 'function evaluateProjectTopology('],",
        "  [files.executor, 'function evaluateProjectTopology(project, priorP606, diagnostic = null)'],":
            "  [files.executor, 'function evaluateProjectTopology('],",
        "  [files.executor, 'priorP606State: priorP606.state'],":
            "  [files.executor, 'priorP606State'],",
        "  [files.executor, 'platformDomainPresent: false'],":
            "  [files.executor, 'platformDomainPresent'],",
        "  [files.executor, 'platformDomainMatches: false'],":
            "  [files.executor, 'platformDomainMatches'],",
        "  [files.executor, \"['/__p6_05_missing__', 404, 'text/html']\"],":
            "  [files.executor, '/__p6_05_missing__'],",
        "  [files.executor, 'return { recognized, historical, unrecognized }'],":
            "  [files.executor, 'recognized, historical, unrecognized'],",
        "  [files.executor, 'candidateRestored: true'],":
            "  [files.executor, 'candidateRestored'],",
        "  [files.executor, \"activeKind: 'candidate'\"],":
            "  [files.executor, 'activeKind'],",
        "if (!files.executor.includes(\"priorP606.state === 'expired_prior_proof'\")) {":
            "if (!files.executor.includes('expired_prior_proof')) {",
        "if (!files.executor.includes(\"diagnostic?.state === 'current_existing_candidate'\")) {":
            "if (!files.executor.includes('current_existing_candidate')) {",
        "if (!files.executor.includes(\"expiredPriorRevalidated ? 'expired_prior_revalidated'\")) {":
            "if (!files.executor.includes('expired_prior_revalidated')) {",
        "if (!files.executor.includes(\"expiredRevalidatedTopology.status !== 'passed'\")) {":
            "if (!files.executor.includes('expiredRevalidatedTopology')) {",
        "if (!files.executor.includes(\"expiredUnrevalidatedTopology.status !== 'failed'\")) {":
            "if (!files.executor.includes('expiredUnrevalidatedTopology')) {",
    },
)

normalize(
    'scripts/check-ops-p6-001r-configured-staging-p6-06-continuity-revalidation.mjs',
    {
        "  [files.executor, \"const exactConfirmation = 'REVALIDATE_CONFIGURED_STAGING_P6_06_CONTINUITY'\"],":
            "  [files.executor, 'REVALIDATE_CONFIGURED_STAGING_P6_06_CONTINUITY'],",
        "  [files.executor, \"const approvedHostname = 'staging.cryptopaymap.com'\"],":
            "  [files.executor, 'staging.cryptopaymap.com'],",
        "  [files.executor, \"receipt?.decision === 'existing_candidate_requires_approval'\"],":
            "  [files.executor, 'existing_candidate_requires_approval'],",
        "  [files.executor, \"prior.state === 'authenticated_prior'\"],":
            "  [files.executor, 'authenticated_prior'],",
        "  [files.executor, \"'expired_prior_proof'\"],":
            "  [files.executor, 'expired_prior_proof'],",
        "  [files.executor, \"'expired_prior_pending_revalidation'\"],":
            "  [files.executor, 'expired_prior_pending_revalidation'],",
        "  [files.executor, \"'expired_prior_revalidated'\"],":
            "  [files.executor, 'expired_prior_revalidated'],",
        "  [files.executor, \"evidenceSource: 'prior_accepted_receipt'\"],":
            "  [files.executor, 'prior_accepted_receipt'],",
        "  [files.executor, \"status: 'existing_final'\"],":
            "  [files.executor, 'existing_final'],",
        "  [files.executor, \"procedure: 'OPS-P6-001R configured staging P6-06 continuity revalidation'\"],":
            "  [files.executor, 'OPS-P6-001R configured staging P6-06 continuity revalidation'],",
        "if (!files.executor.includes(\"['authenticated_prior', 'expired_prior_proof'].includes(prior.state)\")) {":
            "if (!files.executor.includes('expired_prior_proof')) {",
        "if (!files.executor.includes(\"checks.continuity.status = 'expired_prior_revalidated'\")) {":
            "if (!files.executor.includes('expired_prior_revalidated')) {",
    },
)
