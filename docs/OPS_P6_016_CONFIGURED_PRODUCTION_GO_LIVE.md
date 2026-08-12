# OPS-P6-016 — Configured production go-live cutover and rollback executor

## Purpose

This slice implements the separately authorized P6-08 production routing execution layer. It is not production authorization and it does not close launch evidence.

The executor may run only after the exact current `main` has a non-expired configured-production authorization that binds the accepted production candidate and ready production-readiness evidence.

The implementation PR never dispatches the production execution job.

## Explicit execution boundary

The exact confirmation is:

`EXECUTE_CONFIGURED_PRODUCTION_GO_LIVE`

A run also requires:

- the exact 40-character current `main` commit;
- the exact configured-production `authorizationId`;
- the authorized production execution owner;
- the authorized production rollback owner;
- a successful exact-source repository-contract recheck;
- the protected GitHub `production` environment.

The execution owner digest must match the authorization launch-owner digest. The rollback owner digest must match the authorization rollback-owner digest. The two raw owner identities must remain distinct.

## Required evidence binding

Immediately before any provider mutation the executor re-reads:

- `config/production-authorization/authorization-receipt.json`;
- `config/production-authorization/production-candidate-bootstrap-receipt.json`;
- `config/production-authorization/readiness-diagnostic.json`.

All must be current, non-expired, and bound to the exact evaluated commit. The authorization's production-evidence binding must exactly match the candidate artifact ID, public-tree digest, dataset/schema identity, release-authority digest, candidate receipt digest, and readiness receipt digest.

A changed candidate, changed readiness receipt, wrong authorization ID, changed commit, expired evidence, or wrong operator fails before mutation.

## Observed legacy topology and minimal migration

The approved migration keeps `www.cryptopaymap.com` as the canonical host.

The retained legacy class is deliberately narrow:

- apex `cryptopaymap.com` has exactly the serving A record `216.198.79.1`, DNS-only, automatic TTL;
- apex also has the existing Google verification TXT, which is unrelated to serving cutover;
- `www.cryptopaymap.com` has exactly one serving CNAME to `02eeaa61ea1e3365.vercel-dns-017.com`, DNS-only, automatic TTL;
- HTTPS apex returns Vercel 307 to the same path/query on `www.cryptopaymap.com`;
- HTTPS `www` serves the legacy Vercel site;
- `cryptopaymap-production` is the exact candidate project and has no live custom domain before execution;
- `cryptopaymap-staging` remains a separate unchanged project.

Any topology outside that class is a no-go condition.

## Owned production mutation

The apex is not mutated in this launch cutover.

The Google verification TXT is never modified or deleted.

The executor owns only the canonical `www` serving CNAME and the `www.cryptopaymap.com` Pages custom-domain attachment. To establish the candidate it:

1. revalidates and deletes only the exact retained Vercel `www` CNAME by provider record ID;
2. creates only `www.cryptopaymap.com CNAME cryptopaymap-production.pages.dev` with `proxied: true` and automatic TTL;
3. attaches only `www.cryptopaymap.com` to the already verified `cryptopaymap-production` Pages project;
4. waits for the exact Pages-domain/DNS topology to become active.

No broad DNS cleanup is permitted. The staging project/domain is outside the mutation boundary.

## External cutover verification

The candidate is not accepted from provider control-plane success alone. External verification requires:

- public apex DNS still resolves to the retained Vercel apex target;
- apex HTTPS still returns exactly 307 to the same path/query on canonical `www` and still identifies the legacy redirect service;
- canonical `www` resolves through the new proxied Pages target and no longer exposes the legacy Vercel CNAME;
- canonical `www` serves public HTML plus `version.json`, `data/manifest.json`, and `robots.txt` with expected statuses/types;
- `p6-05-release.json` matches the authorized release-authority digest, candidate artifact ID, and public-tree digest;
- `version.json` and `data/manifest.json` match the authorized candidate dataset/schema identity and remain `canonicalOnly: true`;
- unauthenticated Admin `/admin/` returns exactly 403 with private/no-store/noindex/nosniff security headers.

A 503 Admin configuration-unavailable result is not accepted.

## Mandatory rollback drill

A first successful candidate cutover is not final. The same execution performs a rollback drill.

Rollback:

1. removes only the owned `www.cryptopaymap.com` Pages custom domain;
2. deletes only the exact owned proxied Pages `www` CNAME;
3. restores exactly one legacy Vercel `www` CNAME to `02eeaa61ea1e3365.vercel-dns-017.com`, DNS-only, automatic TTL;
4. waits for the narrow legacy provider class;
5. externally proves canonical `www` is again served by Vercel and apex again preserves the same 307 path/query redirect contract.

The executor then re-establishes the candidate through the same bounded mutation and externally verifies it again.

If any cutover or final-restore step fails, the executor attempts the bounded legacy rollback. A successfully restored legacy state is recorded as `rolled_back`; it is not treated as launch success. Failure to prove rollback is `verification_failed`.

## Retained receipt

The bounded receipt is written to:

`config/production-authorization/go-live-receipt.json`

It retains only bounded operational evidence such as:

- exact commit and digested authorization ID;
- operator digests;
- authorized candidate/evidence binding;
- provider-state digests for pre-state, candidate, rollback, and final restore;
- external-observation digests;
- terminal state and bounded exception classes.

Secrets, raw provider tokens, raw database URLs, private submission data, and unrestricted provider payloads are never retained.

## Terminal state

`accepted` means:

- exact pre-state passed;
- first candidate cutover passed provider and external verification;
- rollback drill passed provider and external verification;
- final candidate restore passed provider and external verification;
- apex/unrelated DNS/staging state remained unchanged.

`rolled_back` means execution failed but the exact legacy state was restored and externally verified.

`verification_failed` means the executor could not safely prove a valid terminal state.

This slice does not close launch. Even an `accepted` receipt must enter the separate P6-08 post-cutover observation and launch-close evaluator before Phase 6 can close.

Parent: #293. Implementation: #420.
