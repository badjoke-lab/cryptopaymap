# OPS-P6-001L — Configured staging P6-06 guarded domain cutover and rollback

## Approved scope

The operator approved exactly one configured staging hostname:

- `staging.cryptopaymap.com`

The bounded provider scope is:

- zone: `cryptopaymap.com`, selected by the protected `P6_06_STAGING_ZONE_ID`;
- Cloudflare Pages project: `cryptopaymap-staging`;
- Pages production branch: `staging-review`;
- target: `cryptopaymap-staging.pages.dev`;
- record class: one proxied automatic-TTL CNAME for the approved hostname.

This procedure does not authorize the apex, `www`, any production hostname, any unrelated DNS record, any registrar setting, canonical data mutation, or final launch authorization.

Pull-request and push validation run only the repository contract and self-test; provider mutation is reachable only through the exact-confirmation `workflow_dispatch` execution job.

## Preconditions

Execution stops before mutation unless all of the following are true:

1. the supplied revision is the exact current `main` commit;
2. the exact confirmation is `EXECUTE_CONFIGURED_STAGING_P6_06`;
3. the supplied hostname is exactly `staging.cryptopaymap.com`;
4. an operator and bounded change-window label are supplied;
5. repository validation and the P6-06 contract check pass on the evaluated source;
6. P6-01 through P6-05 receipts are current, accepted, unexpired, on the same commit, and share one binding;
7. the current read-only P6-06 diagnostic is unexpired, reports `no_candidate`, has successful DNS read, matches one protected zone, and has no exception;
8. the Pages project, production branch, platform domain, selected zone, hostname record set, and Pages custom-domain set match the expected pre-state.

The pre-state is read twice and the redacted digest must remain unchanged before the first mutation.

## Cutover

The executor:

1. creates only the exact approved CNAME;
2. adds only the approved Pages custom domain;
3. waits for the Pages domain to become active;
4. rejects extra custom domains, multiple hostname records, wrong record types, wrong targets, non-proxied records, or a changed zone/project topology.

Creating the DNS record first proves `DNS Write` before any Pages binding is changed. No broad DNS update, record replacement, zone-wide mutation, cache purge, or project replacement is allowed.

## External evidence

A cutover is not accepted only from provider state. The executor checks:

- authoritative DNS;
- Cloudflare and Google independent recursive resolvers;
- externally trusted TLS with hostname coverage, modern protocol, and a bounded validity window;
- HTTP-to-HTTPS redirect behavior;
- representative list, detail, online-service, machine-readable, media, robots, and 404 routes;
- canonical links when present, rejecting a different hostname;
- protected Admin denial;
- the P6-05 release marker, binding responses to the intended active candidate release.

Only redacted digests, counts, status classes, protocol class, timestamps, and bounded receipt identifiers are retained.

## Rollback drill

After a successful initial cutover, the executor performs a rollback drill:

1. deletes only the approved Pages custom-domain binding created by the run;
2. deletes only the exact DNS record ID created by the run after rechecking its hostname, type, and target;
3. verifies the provider topology returned to the absent pre-state;
4. verifies authoritative and independent recursive observations return to absence;
5. restores the approved final staging state;
6. repeats DNS, TLS, redirect, route, Admin-boundary, and active-release checks.

Any failed phase triggers a best-effort rollback of only resources whose identifiers were returned by successful mutations in the same run. A conflicting or concurrently created record or domain is never adopted or deleted.

## Duplicate and concurrent execution

A second execution is idempotent only when an unexpired accepted P6-06 receipt exists for the same commit and binding and the provider already has the exact final topology. Otherwise, a non-absent pre-state is an explicit conflict. The workflow concurrency group permits one executor at a time.

## Receipt

The retained configured-staging receipt is:

`config/staging-authorization/p6-06-domain-cutover-rollback-receipt.json`

It records the exact source revision, shared binding, hostname digest, diagnostic digest, pre-state digest, cutover/rollback/final provider digests, resolver/TLS/route evidence digests, operator digest, change-window digest, workflow run, expiry, and bounded exceptions. It does not retain credentials, raw account/zone/record identifiers, certificate private material, or unrestricted provider responses.
