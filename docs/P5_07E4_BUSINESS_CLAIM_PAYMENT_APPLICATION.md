# P5-07E4 Business Claim payment application

**Implementation item:** P5-07E4  
**Status:** Completed in #258  
**Last updated:** 2026-07-20

## Purpose

P5-07E4 consumes one exact P5-07E3 private payment plan and applies it to canonical payment records. The plan is the sole canonical instruction source; the client cannot rewrite Claims, Claim Assets, registries, processors, provenance, or verification history.

The canonical payment write is one atomic canonical transaction. The common application lifecycle transition is recorded immediately afterward with replay-safe recovery if canonical state committed but the lifecycle receipt failed.

## Client-controlled surface

The client supplies only:

- one canonical request UUID;
- the exact E3 plan UUID;
- expected application, relationship-decision, field-event, plan-created, and E2 `draftSetHash` versions.

The client cannot supply canonical Claim IDs beyond those already fixed in E3, Claim Asset row IDs, Source Record IDs, Verification Event IDs, provenance roles, insertion lists, deletion lists, or lifecycle receipt IDs.

## Pre-commit validation

The service strictly parses the exact E3 event and verifies:

- one approved and resolved Business Claim Submission;
- one exact relationship decision and one exact field-application event;
- one exact E3 plan with matching application, target, versions, and `draftSetHash`;
- strict accepted proposal order;
- unique and disjoint planned/existing Claim IDs;
- unique inserted and preserved Claim Asset row IDs;
- one exact Claim owner for every item;
- exactly one primary row for every new candidate Claim;
- no duplicate payment tuple in a new or final existing Claim set;
- no multiple-primary result for an existing Claim;
- exact target Entity and Location versions;
- exact existing Claim versions and complete Claim Asset row sets.

Malformed or stale plans fail before canonical mutation.

## Atomic canonical transaction

The Drizzle backend acquires an application-scoped PostgreSQL advisory transaction lock and rechecks:

- pending/blocked application state and exact `updatedAt`;
- exact relationship, field, and plan events;
- exact target Entity/Location versions;
- complete existing Claim and Claim Asset sets;
- active Asset, Network, Payment Method, and processor identities;
- absence of planned new Claim and row UUIDs;
- exact already-present rows;
- active `business_representative` Source identity;
- absence of a prior payment application receipt.

The same transaction then:

1. creates one private Source Record;
2. creates planned hidden candidate Acceptance Claims;
3. inserts planned Claim Asset rows;
4. leaves already-present rows unchanged;
5. advances `updatedAt` for affected existing Claims;
6. creates one `corrected` Verification Event per affected Claim;
7. creates Claim, Claim Asset, and Verification Event provenance links;
8. creates the private canonical Submission event `business_claim_payments_applied`;
9. verifies the resulting rows before commit.

No canonical Claim or Claim Asset is deleted. Entity and Location records are not changed.

## Provenance roles

- new Acceptance Claim: `origin`;
- existing Acceptance Claim: `verification`;
- inserted Claim Asset: `origin`;
- already-present Claim Asset: `verification`;
- generated Verification Event: `verification`.

One Source Record covers the complete exact payment plan and preserves the accepted proposal order and canonical identities privately.

## Verification history

Each affected Claim receives one `corrected` Verification Event with reason:

```text
business_claim_payment_information_applied
```

The event remains private because it carries an internal application note and no public summary.

## Application lifecycle and replay-safe recovery

After canonical commit, the common application transitions from:

```text
pending / blocked
```

to:

```text
committed / pending
```

The application receipt points to the exact `business_claim_payments_applied` Submission event.

The same request UUID is used for the canonical event and lifecycle transition. If canonical commit succeeds but lifecycle recording fails, a retry validates the exact created Claims, Claim Assets, Source Record, Verification Events, provenance links, and canonical event, then records only the missing lifecycle transition. It does not perform a second canonical write.

A completed replay returns `already_applied`. Reusing the UUID with different content fails closed.

## Protected API

```text
POST /admin/api/business-claim-applications/:applicationId/apply-payments
```

The route requires verified Admin identity plus:

```text
CPM_ADMIN_BUSINESS_CLAIM_PAYMENT_APPLY_SUBJECTS
CPM_BUSINESS_CLAIM_SOURCE_ID
```

Responses are `private, no-store`, and bounded errors do not expose private Claim, payment, Source, or provenance material.

## Exclusions

P5-07E4 does not:

- publish candidate Claims or make hidden Claims public;
- activate export or release;
- change Entity or Location profile fields;
- write Entity and Location field-level provenance;
- delete or replace existing Claim Asset rows;
- create public Evidence;
- execute retention;
- add a database migration;
- claim production environment configuration.

## Next

The remaining P5-07E owner is Entity and Location field-level provenance completion for the field changes already applied in H2. Publication and export remain separate later owners.
