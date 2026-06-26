#!/usr/bin/env bash
set -euo pipefail

npm run db:generate

rm -f .github/workflows/p207-db.yml
rm -f scripts/commit-p207-db.sh
rm -f .p207-trigger

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git commit -m "P2-07: commit generated database files"
git push origin HEAD:work/p207
