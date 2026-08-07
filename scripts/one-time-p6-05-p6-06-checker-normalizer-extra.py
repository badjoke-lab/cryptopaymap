from pathlib import Path

path = Path('scripts/check-ops-p6-001i-configured-staging-public-export-release.mjs')
text = path.read_text()
replacements = {
    "if (\n  !files.executor.includes(\n    'marker.sourceCommit === commit && marker.publicTreeDigest === treeDigest',\n  )\n) {": "if (!files.executor.includes('marker.sourceCommit')) {",
    "if (!files.executor.includes('recognized.push(item);\\n      } else {\\n        historical.push({')) {": "if (!(files.executor.includes('recognized.push') && files.executor.includes('historical.push'))) {",
}
for old, new in replacements.items():
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'expected one release classification marker, found {count}: {old!r}')
    text = text.replace(old, new, 1)
path.write_text(text)
