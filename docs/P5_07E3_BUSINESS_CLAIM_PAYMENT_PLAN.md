# P5-07E3 Business Claim payment plan

**Implementation item:** P5-07E3  
**Status:** Completed in #257  
**Last updated:** 2026-07-20

## Purpose

P5-07E3 converts one exact P5-07E2 private payment preview into a durable, replayable payment application plan without mutating canonical Claims, Claim Assets, registries, provenance, or application lifecycle state.

The plan is the sole bridge between read-only classification and the later atomic canonical transaction.

## Client-controlled surface

The client supplies only:

- one canonical request UUID;
- exact expected application, source-decision, field-event, and E2 `draftSetHash` versions;
- one compatible existing Claim ID for each E2 item whose readiness is `needs_selection`.

The client cannot supply registry IDs, processor IDs, candidate Claim IDs, Claim Asset row IDs, canonical operations, primary-row rewrites, or deletion lists.

## Server-derived plan

The service reruns E2 and derives:

- exact accepted proposal order;
- active Asset, Network, Payment Method, and processor identities;
- existing Claim targets or deterministic hidden candidate Claim IDs;
- deterministic Claim Asset row IDs;
- exact already-present rows;
- primary-row conflict checks;
- current selected Claim versions and Claim Asset set hashes;
- target Entity and Location versions;
- one bounded private event payload.

No compatible Claim is guessed when E2 returned multiple choices.

## Durable event

The event action is:

```text
business_claim_payment_plan_prepared
```

The event ID equals the request UUID. Exact replay returns the existing receipt. Reusing the UUID with changed content fails, and one application cannot acquire a second payment plan under a different UUID.

## Candidate Claim grouping

Drafts with no compatible Claim are grouped by exact target, route, and processor. One deterministic hidden candidate Claim is planned for each group. Conflicting how-to-pay instructions or restrictions within one group fail closed rather than being merged by guesswork.

## Existing Claim guards

Every selected existing Claim is bound by:

- exact Claim ID;
- expected Claim `updatedAt`;
- complete current Claim Asset set hash;
- row count.

The commit backend also guards the exact current rows, active registries, target versions, relationship decision, field event, and pending/blocked application state under an application-scoped PostgreSQL advisory transaction lock.

## Privacy and access

The POST route requires verified Admin identity plus the dedicated allow-list:

```text
CPM_ADMIN_BUSINESS_CLAIM_PAYMENT_PLAN_SUBJECTS
```

Responses are `private, no-store`. The durable payload is stored only in a private Submission event.

## Exclusions

P5-07E3 does not:

- create or update Acceptance Claims;
- create or update Claim Assets;
- change Entity or Location data;
- create Source Records, provenance, Evidence, or Verification Events;
- transition the common application lifecycle;
- activate export or release;
- execute retention;
- add a database migration;
- claim deployment configuration.

## Next

P5-07E4 should consume one exact E3 plan and atomically create planned candidate Claims, insert planned Claim Asset rows, preserve already-present rows, write payment provenance and verification history, and commit the common application. Entity and Location field-level provenance completion remains a separate atomic owner.
