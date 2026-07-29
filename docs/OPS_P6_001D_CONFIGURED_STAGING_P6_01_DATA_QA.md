# OPS-P6-001D — Configured staging P6-01 data QA evidence

## Status boundary

This operational slice executes configured staging data QA. It does not authorize staging, target production, mutate DNS, activate a public release, or change canonical records.

Repository CI and repository P6-01 contract checks remain prerequisites. They are not substitutes for the configured staging receipt.

## Explicit execution

The workflow `OPS-P6-001D configured staging P6-01 data QA` requires manual dispatch with:

- exact confirmation `EXECUTE_CONFIGURED_STAGING_P6_01`;
- the exact current 40-character main commit SHA;
- a bounded data-operations owner identity.

The owner identity is retained only as a SHA-256 digest.

## Executed checks

The configured procedure performs:

1. exact current-main verification;
2. locked dependency installation;
3. staging-review data materialization and static build;
4. public-export schema validation;
5. accessibility and staging artifact validation;
6. repository migration-history validation;
7. live fixed-review Submission schema and migration-ledger validation;
8. exact-main deployment-receipt validation;
9. exact-main fixed-review live-audit validation;
10. live `/version.json` and `/data/manifest.json` schema validation;
11. every manifest-listed file fetch, schema validation, SHA-256 comparison, and record-count comparison;
12. manifest path uniqueness and allowlist enforcement;
13. canonical-only and reviewed-public-record marker validation;
14. bounded forbidden private-key scanning across public exports;
15. shared launch binding derivation.

The evaluator is a Node-only operational entry point executed through `tsx`. Its behavior is enforced by the dedicated valid-projection and digest-mismatch self-test, while the normal repository lint and formatting checks still inspect the source. Browser/Astro diagnostics are not used as a substitute for that operational runtime test.

## Shared binding

An accepted receipt establishes four deterministic SHA-256 identities:

- `releaseId` — exact commit, dataset version, and ordered public file digests;
- `dataSnapshotId` — manifest digest and ordered file/count/license identities;
- `configurationId` — bounded non-secret staging configuration;
- `environmentId` — configured staging and canonical staging hostname.

Later configured P6-02 through P6-07 receipts must use exactly the same binding. Any mismatch keeps staging authorization fail-closed.

## Retained receipt

The workflow publishes:

`config/staging-authorization/p6-01-data-qa-receipt.json`

on the `staging-review` branch.

The receipt contains only:

- exact commit;
- state and expiry;
- workflow run ID;
- hashed owner identity;
- bounded check results;
- public dataset version, schema version, counts, and digests;
- live schema readiness and migration count;
- shared binding;
- bounded exception codes.

It does not retain database URLs, credentials, private rows, candidate payloads, contact data, status secrets, unrestricted logs, or protected Admin material.

## Expiry

The configured staging P6-01 receipt expires 72 hours after execution. A changed main commit, deployment receipt, live-audit receipt, public manifest, data digest, configuration, or environment requires re-execution.

## Fail-closed behavior

The receipt is `accepted` only when all configured checks pass. Any exact-main mismatch, build/schema/migration failure, stale deployment or live-audit receipt, public schema failure, digest/count mismatch, candidate/private-field exposure, or live schema drift produces `failed` with bounded exceptions.

After successful P6-01 execution, the authorization inventory reruns automatically. Staging remains `not_authorized` until P6-02 through P6-07 are also current and an explicit authorization dispatch succeeds.
