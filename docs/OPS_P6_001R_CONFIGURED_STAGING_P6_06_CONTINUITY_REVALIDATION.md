# OPS-P6-001R — Configured staging P6-06 continuity revalidation

## Purpose

An accepted P6-06 rollback drill already established and then restored the approved configured-staging topology for `staging.cryptopaymap.com`. A later exact-main change that does not intentionally alter that topology still invalidates the source-commit and release binding of the retained receipt.

This slice revalidates the existing final topology and the newly active P6-05 release without repeating DNS or Pages mutations. It retains the prior rollback proof by authenticated digest and writes a current accepted P6-06 receipt only after the current read-only topology diagnostic and external observations pass.

Expiry recovery does not make an expired P6-06 receipt current again by itself. The expired receipt remains historical proof only until every current predecessor, the exact-main topology diagnostic, and the fresh external continuity checks pass in the same revalidation run.

Parent operational issue: #351.

## Preconditions

The workflow requires:

- exact current `main`;
- current accepted P6-01 through P6-05 receipts with one shared binding;
- a current P6-06 read-only diagnostic with decision `existing_candidate_requires_approval`;
- one selected protected zone, successful DNS reads, one Pages custom domain, one safe candidate, and no diagnostic exception;
- a prior accepted configured-staging P6-06 receipt for the approved hostname;
- prior cutover, external cutover, rollback, external rollback, final restore, and final external verification evidence;
- zero exceptions in that prior receipt; when it is expired, it is treated only as historical rollback/final-restore proof and must be revalidated by the current diagnostic plus the fresh external checks in this run.

## Current external verification

The continuity run verifies:

- authoritative public DNS resolution is present;
- TLS is trusted, covers the approved hostname, is not near expiry, and negotiates TLS 1.2 or TLS 1.3;
- HTTP redirects to HTTPS on the approved hostname;
- representative public pages, machine-readable files, media, 404 behavior, and protected Admin denial return the expected status and content type;
- no bounded response contains obvious private configuration markers;
- the active `/p6-05-release.json` marker matches the current P6-05 candidate release identity.

## Safety boundary

The continuity run:

- performs no Cloudflare mutation;
- performs no DNS, Pages custom-domain, certificate, redirect, cache, registrar, canonical-data, database, R2, release-activation, or production mutation;
- does not delete or recreate the active staging hostname;
- does not claim that a new rollback drill occurred;
- retains only hashes, status classes, counts, timestamps, protocol results, expiry information, and bounded prior-evidence references;
- fails closed when the topology diagnostic is missing, unsafe, ambiguous, or not exactly one approved existing candidate;
- fails closed when prior rollback proof is missing, malformed, or contains any exception; expired proof is accepted only as historical evidence after the current exact-main diagnostic is safe and this run's fresh DNS, TLS, route, Admin-boundary, and release-identity checks all pass.

The pull-request and push jobs execute only repository validation and self-tests. The self-test uses schema-valid SHA-256 binding fixtures and proves ambiguous topology remains fail-closed. Live continuity revalidation is available only through `workflow_dispatch` with exact confirmation `REVALIDATE_CONFIGURED_STAGING_P6_06_CONTINUITY`.

## Receipt

The workflow replaces the configured-staging P6-06 receipt at:

`config/staging-authorization/p6-06-domain-cutover-rollback-receipt.json`

The new receipt:

- is bound to the current exact main and current P6-01 through P6-05 binding;
- records the current diagnostic and external verification;
- records the prior accepted P6-06 receipt digest and previous rollback/final-restore evidence digests;
- classifies the active topology as an existing final state;
- records rollback and final restoration as inherited prior evidence, not newly executed work;
- expires after 72 hours;
- is accepted only with zero exceptions.

A current accepted continuity receipt satisfies the P6-06 predecessor boundary for the next configured-staging P6-07 diagnostic. It does not authorize P6-07, configured staging launch, production authorization, or production cutover.
