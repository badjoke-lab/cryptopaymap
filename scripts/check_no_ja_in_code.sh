#!/usr/bin/env bash
set -euo pipefail
PATTERN='[\x{3040}-\x{30ff}\x{4e00}-\x{9fff}]'
FILES=$(git ls-files 'src/**/*.ts' 'scripts/**/*.ts' '.github/**/*.yml' || true)
FAILED=0
for f in $FILES; do
  if perl -CS -ne "exit 1 unless /$PATTERN/u" "$f"; then
    echo "FAIL (JP text found): $f"
    FAILED=1
  fi
done
if [ "$FAILED" -ne 0 ]; then
  echo "Japanese text detected in code files."
  exit 2
fi
echo "OK: no Japanese detected."
