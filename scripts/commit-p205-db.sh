#!/usr/bin/env bash
set -euo pipefail
npm run db:generate
rm -f .github/workflows/p205-db.yml scripts/commit-p205-db.sh
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git commit -m "P2-05: commit generated database files"
git push origin HEAD:work/p205
