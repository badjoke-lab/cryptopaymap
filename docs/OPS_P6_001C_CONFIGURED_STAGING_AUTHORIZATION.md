# OPS-P6-001C — Configured staging authorization gate

## Status boundary

This gate evaluates configured staging evidence. It does not deploy production, mutate DNS, activate a production release, or close Phase 6.

A green repository workflow is not launch authorization. The retained receipt is authoritative only for the exact commit and bounded identities recorded in that receipt.

## Current proven baseline

For main `71962246127a06b9de708595518666b4b93c4e4a`, the retained `staging-review` branch records:

- configured staging deployment: `deployed`;
- configured readiness: successful;
- fixed-review database schema: successful;
- first Suggest POST: HTTP 202;
- exact replay: HTTP 202 with matching public reference and status secret;
- changed-content replay: HTTP 409;
- stable public artifacts unchanged.

These results prove the fixed-review deployment path. They do not replace configured P6-01 through P6-07 evidence.

## Required configured predecessor receipts

The gate reads these exact paths from the `staging-review` branch:

| Evidence | Receipt path |
| --- | --- |
| P6-01 data and launch baseline | `config/staging-authorization/p6-01-data-qa-receipt.json` |
| P6-02 identity and protected Admin | `config/staging-authorization/p6-02-identity-admin-receipt.json` |
| P6-03 Neon transaction | `config/staging-authorization/p6-03-neon-transaction-receipt.json` |
| P6-04 R2 media lifecycle | `config/staging-authorization/p6-04-r2-media-lifecycle-receipt.json` |
| P6-05 public export and release | `config/staging-authorization/p6-05-public-export-release-receipt.json` |
| P6-06 domain, TLS, redirect, and rollback | `config/staging-authorization/p6-06-domain-cutover-rollback-receipt.json` |
| P6-07 monitoring, alerting, backup, restore, and incident readiness | `config/staging-authorization/p6-07-operations-recovery-receipt.json` |

Each predecessor receipt must contain:

- `version: 1`;
- its exact `evidenceId`;
- `environment: configured_staging`;
- `state: accepted`;
- the exact approved 40-character commit SHA;
- valid `generatedAt` and future `expiresAt` timestamps;
- one shared binding with bounded `releaseId`, `dataSnapshotId`, `configurationId`, and `environmentId` values.

Missing, malformed, failed, expired, commit-mismatched, or binding-mismatched receipts fail closed.

## Evaluation modes

### Inventory mode

A main push records an immediate evidence inventory. Because deployment and live-audit receipts for that commit may still be updating, completion of the successful `P5-02R fixed review live audit` workflow triggers a second inventory bound to the audited main commit. The later receipt replaces the initial inventory and prevents a pre-deployment snapshot from remaining authoritative.

Inventory mode always retains `not_authorized` and includes `explicit_dispatch:required`, even when every predecessor is present.

### Authorization mode

Manual workflow dispatch requires:

- exact confirmation `AUTHORIZE_CONFIGURED_STAGING`;
- exact approved main commit SHA;
- launch owner;
- independent observer;
- rollback owner.

Operator identities are retained only as SHA-256 digests. Plaintext identities, credentials, private payloads, provider secrets, database URLs, and unrestricted logs are not written to the receipt.

Authorization mode emits `authorized` only when the configured deployment receipt, fixed-review live-audit receipt, all seven configured predecessor receipts, expiry checks, exact commit checks, and shared bindings pass. Otherwise it publishes `not_authorized` and the workflow fails after retaining the bounded receipt.

## Retained output

The gate publishes:

`config/staging-authorization/authorization-receipt.json`

on the `staging-review` branch.

The receipt includes:

- state and evaluation mode;
- exact approved commit;
- timestamp and workflow run ID;
- hashed operator identities;
- deployment and live-audit states;
- per-predecessor state and path;
- shared-binding result;
- exact bounded blocker codes.

## Next boundary

The first complete post-audit inventory is expected to remain `not_authorized` until real P6-01 through P6-07 configured receipts are executed and retained. Those operational receipts must be produced separately; they must not be fabricated from repository documentation or CI success.
