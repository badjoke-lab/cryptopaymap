#!/usr/bin/env bash
set -euo pipefail

rm -f drizzle/0005_goofy_spectrum.sql
python - <<'PY'
import json
from pathlib import Path

path = Path('drizzle/meta/_journal.json')
data = json.loads(path.read_text())
data['entries'] = [entry for entry in data['entries'] if entry.get('tag') != '0005_goofy_spectrum']
path.write_text(json.dumps(data, indent=2) + '\n')
PY

npm run db:generate

rm -f .github/workflows/p205-db.yml
rm -f .github/workflows/p205-final-db.yml
rm -f scripts/commit-p205-db.sh
rm -f .p205-trigger

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git commit -m "P2-05: commit generated database files"
git push origin HEAD:work/p205-final
