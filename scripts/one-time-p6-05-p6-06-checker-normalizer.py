from pathlib import Path

path = Path('scripts/check-ops-p6-001i-configured-staging-public-export-release.mjs')
text = path.read_text()

replacements = {
    "  [files.executor, \"const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_05'\"],":
        "  [files.executor, 'EXECUTE_CONFIGURED_STAGING_P6_05'],",
    "  [files.executor, \"const productionBranch = 'staging-review'\"],":
        "  [files.executor, 'staging-review'],",
    "  [files.executor, \"const defaultPagesProject = 'cryptopaymap-staging'\"],":
        "  [files.executor, 'cryptopaymap-staging'],",
    "  [files.executor, \"const approvedStagingCustomDomain = 'staging.cryptopaymap.com'\"],":
        "  [files.executor, 'staging.cryptopaymap.com'],",
    "  [files.executor, \"const evidenceId = 'P6-05'\"],":
        "  [files.executor, 'P6-05'],",
    "  [files.executor, \"const publicTables = ['confirmed', 'online_services']\"],":
        "  [files.executor, 'online_services'],",
}

for old, new in replacements.items():
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'expected one contract marker {old!r}, found {count}')
    text = text.replace(old, new, 1)

path.write_text(text)
