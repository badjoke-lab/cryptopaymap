# production backup baseline 2026-03-22

## context
- baseline taken after production rollout completion and map hotfixes
- intended as pre-cleanup / pre-data-fix restore point

## production counts
- places = 12758
- verifications = 12755
- payment_accepts = 12758
- socials = 15653

## neon baseline branch
- baseline-post-hotfix-2026-03-22

## files
- backup_dir = /Users/lyla/cpm-backups/2026-03-22-post-hotfix-baseline
- full_dump = cpm-prod-full.dump
- schema_dump = cpm-prod-schema.sql
- json_snapshots = places.json / verifications.json / payment_accepts.json / socials.json
- checksums = SHA256SUMS.txt

## note
- cleanup / delete / suspicious-data fixes must start only after this baseline exists
