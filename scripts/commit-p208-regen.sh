#!/usr/bin/env bash
set -euo pipefail

rm -f drizzle/0008_wet_chronomancer.sql
rm -f drizzle/meta/0008_snapshot.json
python - <<'PY'
import json
from pathlib import Path

path = Path('drizzle/meta/_journal.json')
data = json.loads(path.read_text())
data['entries'] = [entry for entry in data['entries'] if entry.get('tag') != '0008_wet_chronomancer']
path.write_text(json.dumps(data, indent=2) + '\n')
PY

npm run db:generate

rm -f .github/workflows/p208-regen.yml
rm -f scripts/commit-p208-regen.sh
rm -f .p208-regen-trigger

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git commit -m "P2-08: regenerate database files"
git push origin HEAD:work/p208-final
