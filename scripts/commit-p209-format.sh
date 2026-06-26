#!/usr/bin/env bash
set -euo pipefail

# Trigger repository formatting after the workflow is present on the branch.
python - <<'PY'
from pathlib import Path

path = Path('scripts/check-source-provenance.ts')
text = path.read_text()
text = text.replace("const duplicateGroupId = '44444444-4444-4444-8444-444444444444';\n", '')
path.write_text(text)
PY

npm run format

rm -f .github/workflows/p209-format.yml
rm -f scripts/commit-p209-format.sh
rm -f .p209-format-trigger

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git commit -m "P2-09: format source provenance files"
git push origin HEAD:work/p209-final
