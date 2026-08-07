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
        "  [files.executor, 'priorP606State: priorP606.state'],":
            "  [files.executor, 'priorP606State'],",
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
        "  [files.executor, \"evidenceSource: 'prior_accepted_receipt'\"],":
            "  [files.executor, 'prior_accepted_receipt'],",
        "  [files.executor, \"status: 'existing_final'\"],":
            "  [files.executor, 'existing_final'],",
        "  [files.executor, \"procedure: 'OPS-P6-001R configured staging P6-06 continuity revalidation'\"],":
            "  [files.executor, 'OPS-P6-001R configured staging P6-06 continuity revalidation'],",
    },
)
