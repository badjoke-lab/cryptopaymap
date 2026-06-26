#!/usr/bin/env bash
set -euo pipefail

npm run db:generate

rm -f .github/workflows/p209-db.yml
rm -f scripts/commit-p209-db.sh
rm -f .p209-trigger

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git commit -m "P2-09: commit generated database files"
git push origin HEAD:work/p209
