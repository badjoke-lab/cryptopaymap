# P5-07B2 application lifecycle reads and transitions

**Implementation item:** P5-07B2  
**Status:** Active — protected lifecycle boundary  
**Last updated:** 2026-07-18

## Purpose

P5-07B2 makes the common application record created by P5-07B1 readable through a bounded protected projection and transitionable through a small exact-state machine.

It does not perform a Candidate promotion, correction, Claim update, Media decision, export release, or publication. Those operations remain owned by their existing type-specific services. B2 records the receipt only after the owning operation has produced it.

## Protected projection

The protected read returns:

- application UUID;
- Submission UUID and type;
- source decision kind and exact source decision event UUID;
- application kind;
- application and publication status;
- typed application and publication receipt references;
- registration and current update timestamps;
- at most 50 bounded lifecycle events.

Lifecycle events expose only:

- event UUID;
- action;
- from/to application status;
- from/to publication status;
- timestamp.

The projection excludes actor identifiers, request fingerprints, reviewer notes, Submission payload, contact data, private Evidence, ownership proof, storage references, and release content.

## State machine

Only these transitions are accepted:

```text
pending / blocked
├─ commit_application + non-publication receipt
│  → committed / pending
└─ fail_application
   → failed / blocked

failed / blocked
└─ retry_application
   → pending / blocked

committed / pending
├─ commit_publication + export release decision receipt
│  → committed / committed
└─ fail_publication
   → committed / failed

committed / failed
└─ retry_publication
   → committed / pending
```

The request supplies the expected current statuses and exact `updatedAt`, but it does not supply the destination statuses or event action. The server derives those from the operation.

## Receipt rules

`commit_application` requires one bounded typed receipt whose kind is not `export_release_decision`.

Allowed application receipt kinds remain:

- `submission_event`;
- `candidate_promotion_decision`;
- `media_review_decision`.

`commit_publication` requires an `export_release_decision` receipt.

Failure and retry transitions accept no receipt. A committed application always retains its application receipt. A committed publication always retains its release receipt.

B2 does not validate the domain-specific meaning of a receipt beyond its type and UUID shape. P5-07C through P5-07F own the exact binding between a Submission type, its application operation, and its accepted receipt.

## Exact-state and replay behavior

Every transition request includes:

```text
schemaVersion
requestId
operation
expectedApplicationStatus
expectedPublicationStatus
expectedUpdatedAt
receipt
```

The service and Drizzle backend enforce:

- exact application UUID;
- exact current application status;
- exact current publication status;
- exact current `updatedAt`;
- retained source decision event identity;
- one transition event per request UUID;
- application-scoped advisory lock;
- atomic application-row update plus append-only lifecycle event.

Replay behavior:

```text
same request UUID + same application + same actor + same content
→ replayed transition receipt

same request UUID + changed application, actor, operation, state, or receipt
→ idempotency conflict

stale status or updatedAt
→ conflict without state change
```

## Authorization

Read and transition authority are separate exact-subject allowlists:

```text
CPM_ADMIN_SUBMISSION_APPLICATION_READ_SUBJECTS
submission:application:read

CPM_ADMIN_SUBMISSION_APPLICATION_TRANSITION_SUBJECTS
submission:application:transition
```

Registration authority from P5-07B1 does not imply either B2 capability.

## API

```text
GET  /admin/api/application-lifecycle/:applicationId
POST /admin/api/application-lifecycle/:applicationId
```

Both responses are private and no-store. Error responses use bounded codes and do not expose database or private review details.

## Explicit non-effects

P5-07B2 does not:

- create, promote, or link a Candidate;
- update Entity, Location, Claim, Claim Asset, Evidence, Verification Event, or Media;
- apply a correction;
- execute a Business Claim field application;
- copy or publish Media objects;
- generate, activate, or restore an export;
- delete or anonymize private data;
- execute retention;
- expose a public endpoint;
- claim production configuration or deployment.

## Next

P5-07C should bind Suggest application completion to exact existing Candidate promotion or existing-target linking receipts and use B2 to record the resulting common lifecycle transition without duplicating the canonical operation.
