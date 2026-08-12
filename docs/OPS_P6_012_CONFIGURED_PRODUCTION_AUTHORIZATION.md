# OPS-P6-012 — Configured production authorization

## Purpose

This slice implements the separately bounded production authorization gate required by Issue #293 and the P6-08 launch contract.

Production authorization does not execute production. It records whether one exact current `main` commit is eligible for a later, separate go-live execution under the retained configured-staging evidence set.

## Mandatory predecessor boundary

Authorization fails closed unless the current configured-staging authorization receipt proves all of the following:

- `environment: configured_staging`;
- explicit authorization mode and `state: authorized`;
- the same exact current `main` commit requested for production authorization;
- current deployment and fixed-review live-audit evidence;
- P6-01 through P6-07 are all current and unexpired;
- the predecessor release/data/configuration/environment binding is matched;
- the configured-staging receipt has no blockers.

A previous staging authorization for another commit, a stale P6 receipt, a changed binding, or a missing receipt cannot authorize production.

Authorization also requires two separately retained pre-live production controls on the same exact commit:

- an accepted, non-expired production candidate bootstrap receipt for the dedicated `cryptopaymap-production` project;
- a non-expired production readiness diagnostic with `decision: ready`.

The production candidate bootstrap must retain a valid candidate artifact identity, dataset/schema identity, successful external verification, zero live-domain/DNS/canonical-host mutation, and a release-authority digest matching the current accepted P6-05 candidate release. The readiness receipt must independently bind that same P6-05 release authority and prove the protected production environment, production-specific runtime-input presence, dedicated Pages project observation, active zone/DNS observation, and candidate release marker. Any mismatch fails closed.

## Explicit production authorization

The workflow requires the exact confirmation:

`AUTHORIZE_CONFIGURED_PRODUCTION`

The authorization is rejected unless the repository contract passes and the dispatch supplies bounded, distinct identities for:

- launch owner;
- independent observer;
- rollback owner;
- communication owner.

The dispatch also supplies a bounded execution-window length and authorization TTL. Authorization expires before any mandatory predecessor evidence, P6-05 release authority, production candidate bootstrap, or production readiness evidence expires. It cannot extend the usable lifetime of stale evidence. Numeric inputs are accepted only as complete decimal integer strings; malformed values such as a number with a suffix fail closed instead of being partially parsed.

Inventory or non-explicit evaluation remains `not_authorized` with `explicit_dispatch:required`.

## Receipt

The retained production authorization receipt contains only bounded evidence:

- authorization ID;
- exact approved commit;
- generation and expiry time;
- digests of the four operator identities;
- configured-staging authorization state and workflow run ID;
- P6-01 through P6-07 current/stale summaries;
- matched binding;
- P6-05 release-authority state;
- production candidate bootstrap state, candidate artifact ID, and dataset/schema identity;
- production readiness state;
- a production-evidence binding incorporated into the authorization ID;
- execution-window and TTL checks;
- blockers.

Raw credentials, tokens, provider identifiers, private data, unrestricted logs, or private Admin/session material are not retained.

Production mutation: none.

## Separation from go-live execution

An `authorized` production receipt is permission for a separate go-live execution attempt; it is not evidence that go-live occurred.

A separate go-live execution must still:

- revalidate the authorization, exact main, expiry, binding, and execution lease immediately before mutation;
- enforce the P6-08 no-go conditions;
- execute the bounded cutover with stop and rollback rules;
- externally verify DNS, TLS, canonical host, intended release identity, public routes/APIs/media, Admin protection, data freshness/integrity, monitoring, alerting, backup, and rollback readiness;
- complete the observation window;
- retain immutable launch-close or rollback evidence.

If main, release, data, configuration, credentials, mandatory evidence, or authorization expiry changes before execution, a new production authorization is required.

Parent: #293. Implementation: #413.
