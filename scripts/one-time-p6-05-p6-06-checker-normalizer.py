from pathlib import Path

path = Path('scripts/check-ops-p6-001i-configured-staging-public-export-release.mjs')
text = path.read_text()

replacements = {
    "  [files.executor, \"const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_05'\"],":
        "  [files.executor, 'EXECUTE_CONFIGURED_STAGING_P6_05'],",
    "  [files.executor, \"const productionBranch = 'staging-review'\"],":
        "  [files.executor, 'staging-review'],",
    "  [files.executor, \"const productionBaseUrl = 'https://cryptopaymap-staging.pages.dev'\"],":
        "  [files.executor, 'https://cryptopaymap-staging.pages.dev'],",
    "  [files.executor, \"const approvedStagingCustomDomain = 'staging.cryptopaymap.com'\"],":
        "  [files.executor, 'staging.cryptopaymap.com'],",
}

for old, new in replacements.items():
    count = text.count(old)
    if count == 1:
        text = text.replace(old, new, 1)
    elif count > 1:
        raise SystemExit(f'ambiguous contract marker {old!r}: found {count}')

path.write_text(text)
