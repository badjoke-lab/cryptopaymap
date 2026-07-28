# P6-06 — Configured domain cutover and rollback evidence

## Decision

Repository configuration is not proof of a safe domain cutover. P6-06 is a launch-blocking evidence gate for custom-domain ownership, DNS mutation, TLS readiness, canonical-host behavior, external reachability, and bounded rollback.

Configured staging evidence: `unproven`.

Configured production evidence: `unproven`.

Neither environment may be marked `passed` without executed procedures and retained redacted artifacts.

## Preconditions

Before any cutover mutation, evidence must bind:

- the intended zone and hostname;
- ownership or delegated control;
- the current DNS record set and TTL;
- the intended target origin, project, environment, and active release;
- the prior serving path and rollback target;
- the approved operator and change window;
- the source revision and cutover plan revision.

A hostname, zone, target, environment, or release mismatch stops the procedure.

## DNS and binding evidence

The configured run records safe before-and-after evidence for:

- record type, hostname, target digest, proxy state, and TTL;
- provider change receipt and timestamp;
- custom-domain binding state;
- authoritative name-server observations;
- multiple independent recursive resolver observations;
- propagation status during the bounded observation window;
- absence of unintended records or split targets.

No registrar credential, DNS API token, account identifier, zone secret, or unrestricted zone export may appear in retained artifacts.

## TLS and transport evidence

The run proves:

- a valid certificate chain;
- hostname coverage for every intended public host;
- certificate validity and expiry window;
- modern TLS negotiation;
- no plaintext downgrade;
- HTTP-to-HTTPS behavior;
- no certificate mismatch during cutover or rollback;
- safe handling while certificate issuance is delayed.

A control-plane status of `active` is not sufficient without an external TLS handshake and hostname verification.

## Host and redirect matrix

External clients must verify:

| Request | Required result |
| --- | --- |
| HTTP canonical host | bounded redirect to HTTPS canonical host |
| HTTPS canonical host | successful response from intended active release |
| Apex or preferred subdomain variant | documented canonical redirect or direct canonical response |
| Legacy host | documented redirect or retained fallback behavior |
| Path and query | preserved where policy requires |
| Repeated redirect traversal | no loop and bounded hop count |
| Unknown host | denied or safe non-canonical response |
| Protected Admin host/path | remains protected and is not exposed by public-domain cutover |

Redirect evidence includes status code, source host, target host, path/query preservation result, hop count, and final release identity.

## External service checks

Checks must run through external DNS resolvers and network clients, not only from the provider control plane. Representative checks include:

- home, list, and detail pages;
- `/version.json`;
- `/data/manifest.json`;
- public API or machine-readable endpoints;
- approved public media;
- `robots.txt`, `llms.txt`, `ai.txt`, and sitemap;
- 404 and error routes;
- canonical links and absolute URLs;
- security headers and cache headers;
- protected Admin denial or Access challenge.

Every successful response must bind to the intended active release rather than merely returning HTTP 200.

## Failure matrix

| Case | Required result |
| --- | --- |
| Wrong zone or hostname | stop before mutation |
| Wrong target origin or environment | stop before mutation |
| Stale DNS pre-state | conflict; re-read before retry |
| Partial resolver propagation | remain in observation state or roll back |
| Certificate not ready | do not declare cutover passed |
| Certificate mismatch | immediate failure and rollback decision |
| Redirect loop or host bounce | failure; do not continue |
| Mixed old/new release responses | failure unless explicitly bounded and resolved |
| Origin or release failure after DNS change | execute rollback procedure |
| Duplicate cutover execution | idempotent existing result or explicit conflict |
| Concurrent cutover execution | one owner; later actor stops on changed pre-state |

## Rollback evidence

A passing rollback drill proves:

1. the prior DNS and binding state was retained before cutover;
2. rollback authorization and trigger are explicit;
3. the prior target or serving path can be restored without editing canonical data;
4. provider change receipts are retained;
5. authoritative and recursive DNS observations return to the rollback target;
6. TLS remains valid or returns to the documented prior certificate state;
7. external pages, APIs, media, and machine-readable files recover;
8. redirect and canonical-host behavior returns to the prior contract;
9. cache purge or cache-version handling prevents stale failed responses;
10. recovery completes inside the documented rollback objective.

Changing DNS back without externally observing service recovery is not rollback proof.

## Evidence receipt metadata

Each environment receipt records:

- evidence id and environment;
- source revision and cutover-plan revision;
- safe zone and hostname identities or digests;
- pre-change and post-change DNS state digests;
- TTL and provider change receipt safe identifiers;
- custom-domain binding digest;
- intended origin, environment, and release identities;
- authoritative and recursive resolver observations;
- certificate fingerprint digest, issuer class, hostname coverage, validity window, and protocol results;
- redirect matrix digest;
- external endpoint-check digest;
- cache and purge observations;
- rollback target, trigger, execution receipt, and recovery result;
- execution timestamps, operator, exceptions, artifact location, and artifact digest;
- expiry or recheck date.

No registrar password, DNS token, TLS private key, Access secret, deployment credential, session cookie, or private canonical payload may appear.

## Pass rule

An environment may be marked `passed` only when:

- ownership, zone, hostname, target, environment, and release identities match;
- DNS before/after states and provider receipts are retained;
- authoritative and independent recursive observations converge;
- TLS is externally valid for every intended hostname;
- redirects are canonical, bounded, and loop-free;
- public and protected-boundary checks return the intended behavior;
- responses bind to the intended active release;
- stale, duplicate, concurrent, partial-propagation, certificate, redirect, cache, and origin-failure cases satisfy the fail-closed contract;
- rollback is executed or rehearsed with externally observable recovery;
- artifacts are present, redacted, digest-verified, and unexpired;
- no high-severity exception remains open.

Repository audit passing means only that this evidence contract is present and internally consistent.

## Recheck rule

Repeat configured evidence after changes to DNS provider, zone delegation, hostname, record type, target origin, custom-domain binding, TLS mode, redirect rules, canonical-host policy, cache rules, active-release mechanism, rollback target, or protected Admin routing.

Otherwise recheck before launch and at least every 90 days while operational.

## Boundary

This slice does not prove monitoring coverage, alert delivery, backup integrity, restore execution, privacy deletion across all stores, production load capacity, incident response readiness, or final launch authorization.

## Next owner

P6-07 owns configured operational monitoring, alerting, backup, restore, and incident-response evidence.