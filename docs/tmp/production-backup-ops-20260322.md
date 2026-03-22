# production backup ops 2026-03-22

## baseline
- baseline backup created after rollout completion and map hotfixes
- use as pre-cleanup restore point

## automatic backup policy
- daily automatic production backup
- keep last 14 backup directories
- backup contents:
  - full pg_dump custom dump
  - schema-only dump
  - places.json
  - verifications.json
  - payment_accepts.json
  - socials.json
  - counts.json
  - SHA256SUMS.txt

## manual backup policy
always create an extra manual backup before:
- cleanup
- bulk fix
- delete
- schema change

## neon safety point
- baseline child branch:
  - baseline-post-hotfix-2026-03-22

## restore policy
- code rollback: git revert
- db rollback: Neon branch restore and/or backup restore

## next step
- enable scheduled execution for scripts/ops/backup_prod_db.sh
- then proceed to suspicious-data cleanup planning
