# P5-07B1 common application registration

**Implementation item:** P5-07B1  
**Status:** Active — registration boundary  
**Last updated:** 2026-07-17

## Purpose

P5-07B1 introduces one internal lifecycle record per reviewed Submission without replacing any existing canonical transaction.

The record answers three separate questions:

1. Which exact final review decision authorized application work?
2. Has the canonical application already committed, or is it still pending?
3. Is publication blocked, pending, committed, or failed?

Application and publication are stored separately. An approved Submission is not treated as publicly released merely because its review finished.

## Registration request

The protected request is strict:

```text
schemaVersion
requestId
sourceDecisionKind
sourceDecisionEventId
expectedSubmissionUpdatedAt
```

The client cannot supply:

- Submission type;
- application kind;
- application status;
- publication status;
- application receipt;
- publication receipt.

Those values are derived from the current Submission, the referenced durable Submission event, and existing type-specific application receipts.

## Supported source decisions

| Source decision | Required Submission/action | Initial application | Initial publication |
|---|---|---|---|
| Suggest Candidate acceptance | Suggest / `submission_accepted_as_candidate` | Pending unless the Candidate already has a promotion decision | Blocked or pending |
| Positive payment Evidence | Payment report / `positive_payment_evidence_decided` | Committed | Pending |
| Negative report Evidence | Payment or problem report / `negative_report_evidence_decided` | Committed | Pending |
| Problem correction handoff | Problem report / `problem_correction_handoff_approved` | Pending | Blocked |
| Problem Claim mutation | Payment or problem report / urgent-hide or negative-Claim decision | Committed | Pending |
| Business Claim relationship approval | Claim / `business_claim_relationship_approved` | Pending unless `business_claim_fields_applied` already exists | Blocked or pending |
| Photos parent resolution | Photos / `photo_parent_resolution_decided` | Committed | Pending |

Every source must belong to the exact Submission, end in `resolved`, and match the current Submission resolution allowed for that source kind.

## Existing application receipt detection

P5-07B1 does not rerun application work.

It recognizes existing completion through bounded references:

- Candidate promotion or existing-target linking is represented by the existing `candidate_promotion_decisions` row for the accepted Candidate;
- Business Claim field application is represented by the existing `business_claim_fields_applied` Submission event;
- positive/negative report Evidence, Claim mutation, and Photos parent resolution are atomic in their exact final decision event, so that event is the initial application receipt.

Pending Suggest, correction, and Business Claim work receives no synthetic receipt.

## Durable schema

`submission_applications` stores:

- one UUID and registration request UUID;
- one unique Submission;
- one unique source decision event;
- derived application kind;
- application and publication status;
- bounded typed receipt references;
- exact Submission version expected at registration;
- actor, request fingerprint, and timestamps.

`submission_application_events` stores the append-only lifecycle history. B1 writes only `registered`; later P5-07B slices may append application and publication transitions.

The database enforces:

- one record per Submission;
- one record per registration request;
- one record per source decision event;
- receipt kind/ID pairing;
- committed application requires a receipt;
- pending or failed application keeps publication blocked;
- committed publication requires a publication receipt;
- valid time ordering.

## Atomic registration

The Drizzle backend acquires a Submission-scoped advisory lock and revalidates:

- exact Submission UUID and type;
- `resolved` workflow state;
- exact current `updatedAt`;
- exact referenced final decision event;
- no existing application record for the Submission, request, or source event.

It then inserts only:

1. the common application record;
2. the initial `registered` application event.

It does not update the Submission or any canonical Entity, Location, Claim, Claim Asset, Evidence, Candidate, Media, export, or release row.

## Replay and conflicts

```text
same request UUID + same content + same actor → replayed receipt
same request UUID + changed content or actor → idempotency conflict
different request for an already registered Submission → conflict
stale Submission version → conflict
concurrent identical insert → durable replay recovery
```

## Authorization

The protected mutation uses a separate exact-subject allowlist:

```text
CPM_ADMIN_SUBMISSION_APPLICATION_REGISTRATION_SUBJECTS
submission:application:register
```

Other Submission review capabilities do not imply application-registration authority.

## API

```text
POST /admin/api/application-registration/:submissionId
```

Responses are bounded and no-store. Private database details, event payloads, reviewer notes, contact data, status secrets, storage references, and export data are not returned.

## Explicit non-effects

P5-07B1 does not:

- promote or link a Candidate;
- apply a correction;
- create Claim Assets or provenance;
- update Entity, Location, Claim, Evidence, or Media;
- delete private material;
- execute retention;
- activate export or release;
- expose a public endpoint;
- claim configured production authorization or deployment.

## Next

P5-07B2 should add bounded protected lifecycle reads and exact application/publication state transitions using the registered record and append-only event table. It must preserve the type-specific application owners established by P5-07A.
