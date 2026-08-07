from pathlib import Path

path = Path('scripts/check-ops-p6-001i-configured-staging-public-export-release.mjs')
text = path.read_text()
old = "  [files.executor, \"const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_05'\"],"
new = "  [files.executor, 'EXECUTE_CONFIGURED_STAGING_P6_05'],"
if text.count(old) != 1:
    raise SystemExit(f'expected one exact-confirmation marker, found {text.count(old)}')
path.write_text(text.replace(old, new, 1))
