#!/usr/bin/env bash
set -euo pipefail

npm run format

rm -f .github/workflows/p207-format.yml
rm -f scripts/commit-p207-format.sh
rm -f .p207-format-trigger

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git commit -m "P2-07: format evidence files"
git push origin HEAD:work/p207
