# P5-07H — Canonical application and retention integration audit

## Scope

This audit verifies the boundary between canonical application and the P5-07G private-retention executor. It is intentionally non-production and performs no live database or object-store mutation.

## Enforced invariants

1. Private retention requires the `submission:retention:execute` capability.
2. A repeated run returns a validated stored receipt through the replay path.
3. Candidates whose `eligibleAt` is later than the run's effective time are rejected.
4. Database redaction and media cleanup retain deterministic policy/reference identity and durable run/item receipts.
5. Database, photo, and private-media phases are accounted for independently and fail closed into a partial receipt.
6. The retention execution surface contains no direct mutation path for canonical Entity, Location, Claim, Claim Asset, Evidence decision, Media decision, export, release, publication, or public state.

## Executable evidence

Run:

```sh
node scripts/check-p5-07h-retention-integration-audit.js
```

The command exits non-zero if a required guard or receipt invariant disappears, or if a forbidden canonical mutation signature enters the retention execution surface. On success it emits a machine-readable JSON audit receipt.

GitHub Actions runs the same audit through `.github/workflows/p5-07h-retention-integration-audit.yml` whenever the audited execution files, the audit script, or the workflow itself changes.

## Limitations

This is a source and contract integration audit. It does not deploy a production Cron and does not mutate live D1, PostgreSQL, R2, or another object store. Production binding and operational rehearsal remain separate release work.
