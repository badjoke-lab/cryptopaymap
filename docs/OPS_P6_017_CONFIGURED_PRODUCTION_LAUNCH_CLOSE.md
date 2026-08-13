# OPS-P6-017 — Configured production observation and launch close

## Purpose

OPS-P6-017 is the read-only post-cutover observation and launch-close boundary required after an accepted P6-08 go-live execution.

It does not execute cutover, repair production, redeploy the candidate, change DNS, mutate a Pages custom domain, purge cache, rotate credentials, or alter canonical data. It only observes the already-launched production service and closes P6-08 when the complete observation contract remains satisfied.

## Mandatory starting point

Observation fails closed unless the retained `config/production-authorization/go-live-receipt.json` is an accepted P6-08 go-live receipt for the exact current `main` commit and proves:

- configured-production authorization passed;
- the rollback drill passed and was externally observed;
- the final candidate restore passed and was externally observed;
- apex DNS was not mutated;
- unrelated DNS was not mutated;
- staging was not mutated;
- launch close is still false;
- there are no retained go-live blockers or exceptions;
- immutable release, candidate artifact, public tree, dataset/schema, and credential-generation bindings are present.

The retained production authorization and production candidate receipts must match the historical go-live binding. A different release, data/configuration binding, candidate artifact, or credential generation cannot be closed by reusing an older go-live receipt.

## Observation window

The normal dispatch uses 30 minutes with one sample every 5 minutes.

The bounded contract allows:

- observation window: 15 to 60 minutes;
- sample interval: 5 to 15 minutes;
- interval must divide the window exactly;
- at least three samples are mandatory.

The first sample is immediate. Launch cannot close before the complete wall-clock observation interval has elapsed. A missing or failed sample produces `verification_failed`.

This launch-close window is separate from Phase 7 stabilization. Phase 7 remains the longer post-launch operating period and does not become complete merely because P6-08 launch close succeeds.

## Exact evidence and credential binding

The observer requires the same exact commit and P6-08 production evidence binding used by go-live.

The protected `P6_08_PRODUCTION_CREDENTIAL_GENERATION_ID` is rehashed inside the protected GitHub `production` environment. The raw generation marker is not written to the repository or receipt. Its digest must match the go-live binding before observation starts and throughout the job.

A credential/configuration rotation requires a new production readiness, authorization, and go-live chain. OPS-P6-017 does not silently adopt a changed generation.

## Operational evidence freshness

The retained P6-07-Q2 through P6-07-Q5 operational receipts must remain accepted on the exact launched commit and remain unexpired beyond the end of the planned observation window:

- P6-07-Q2 — monitoring and alert exercise;
- P6-07-Q3 — backup integrity;
- P6-07-Q4 — isolated restore;
- P6-07-Q5 — operations and recovery readiness.

Q2 must also retain passed live-monitoring and alert-exercise states. Expiring operational evidence cannot be stretched by the launch-close workflow.

## External sample contract

Each sample independently verifies the already-launched production service.

### DNS, redirect, and TLS

- `cryptopaymap.com` preserves the approved 307 path/query redirect to `www.cryptopaymap.com`;
- the apex remains on the approved legacy A target used by the cutover plan;
- the canonical host resolves publicly and has not reverted to the legacy WWW CNAME;
- TLS is trusted, current, and uses a TLS 1.x protocol;
- only bounded DNS/TLS digests and certificate metadata are retained.

### Public routes and release identity

Representative public pages must return the intended content type, including Places, Online Services, Stats, Updates, Data, and Methodology.

The release marker must match the immutable release authority, candidate artifact ID, and public-tree digest from the accepted go-live receipt.

`version.json` and `data/manifest.json` must retain the intended dataset version, schema version, canonical-only boundary, reviewed-public-record marker, valid manifest record counts, and file digests.

### Machine-readable public files

The observer requires:

- `robots.txt`;
- `llms.txt`;
- `ai.txt`;
- `sitemap.xml`.

The production robots policy must allow normal public crawling, exclude `/admin/`, and reference the canonical sitemap. `llms.txt` and `ai.txt` must keep the reviewed-public-record boundary. The sitemap must contain the canonical home URL and must not expose Admin routes.

### Public asset and Admin boundary

`/icons/cryptopaymap.svg` is used as a stable public-asset retrieval probe. The retained P6-04 evidence remains the configured proof of the R2 media lifecycle itself.

`/admin/` must remain denied by Cloudflare Access with the required private/no-store and noindex security headers. Any Admin exposure or header regression fails observation.

## Incidents, risks, and deferred items

Launch close requires explicit confirmation `NO_LAUNCH_BLOCKING_INCIDENT` from the authorized incident/communication owner.

The dispatch accepts bounded JSON registers for open risks and deferred items. Retained entries contain only bounded IDs, status, severity where applicable, deadlines, and owner digests. Raw owner identities are not retained.

An unresolved `launch_blocking` risk prevents close. Register deadlines must remain valid beyond the observation window. The launch-close receipt also records a required next operational review time after the observation window and no more than 30 days later.

## Operator separation

The observation owner must match the independent observer bound by configured-production authorization. The incident owner must match the authorization communication owner. This prevents an arbitrary workflow actor from replacing the approved close roles.

## Receipt and close state

Every attempt writes a bounded attempt receipt. A successful attempt additionally becomes the immutable launch-close receipt.

`state: closed` requires all of the following:

- exact historical go-live/authorization/candidate binding;
- operational evidence current through the window;
- matching credential generation;
- explicit incident clearance;
- no launch-blocking risk;
- full observation interval elapsed;
- every required external sample passed;
- release/data/DNS/TLS/Admin/machine-file checks remained stable;
- rollback evidence remained available;
- no exception occurred.

The receipt always records `productionMutation: false`. `launchClosed: true` is permitted only when `state` is `closed`.

## Failure behavior

Any failed sample, changed binding, stale evidence, credential-generation mismatch, Admin exposure, release/data mismatch, DNS/TLS regression, machine-file regression, unresolved launch-blocking risk, or incomplete observation window produces `verification_failed`.

OPS-P6-017 does not repair a failure. A separate incident, rollback, or new authorization/execution chain owns remediation.

## Phase handoff

A closed OPS-P6-017 receipt closes the P6-08 launch evidence boundary for that immutable launch. It is not the end of operations. Phase 7 owns the longer stabilization period, recurring monitoring/evidence freshness, Search Console/crawl follow-up, incident handling, and the later legacy-repository archive decision.

Parent: #293. Implementation: #421.
