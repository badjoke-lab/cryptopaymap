# P5-07C Suggest Candidate promotion receipt binding

**Implementation item:** P5-07C  
**Status:** Active — Suggest application binding  
**Last updated:** 2026-07-18

## Purpose

P5-07C links an originating Suggest Submission and its private Candidate to the exact existing Candidate promotion receipt that completed canonical application.

It does not promote or link a Candidate itself. The existing Candidate promotion and existing-target linking services remain authoritative owners of their atomic canonical transactions.

## Existing canonical owners

Both supported Candidate paths write the existing `candidate_promotion_decisions` receipt table:

```text
new-target promotion
→ hidden Entity / optional Location
→ candidate Acceptance Claim and Claim Assets
→ provenance
→ Candidate canonical linkage
→ candidate_promotion_decisions receipt

existing-target linking
→ exact existing Entity / Location target
→ candidate Acceptance Claim and Claim Assets
→ provenance
→ Candidate canonical linkage
→ candidate_promotion_decisions receipt
```

P5-07C treats this shared durable row as the authoritative receipt for either path. It does not infer the path from UI choices or repeat either transaction.

## Binding request

The protected request is strict:

```text
schemaVersion
requestId
promotionDecisionId
expectedApplicationUpdatedAt
```

The client does not supply:

- Submission UUID or type;
- Candidate UUID;
- source decision event UUID;
- Entity, Location, Claim, or Claim Asset UUIDs;
- application or publication status;
- transition action;
- binding result.

Those values are read from the common application record, the exact accepted-as-Candidate Submission event, the Candidate promotion receipt, and the promoted Candidate row.

## Required binding chain

The service validates the complete chain:

```text
common application
├─ submissionType = suggest
├─ sourceDecisionKind = suggest_candidate_acceptance
├─ applicationKind = candidate_resolution
└─ exact sourceDecisionEventId
        ↓
resolved Suggest Submission
├─ resolution = accepted_as_candidate
└─ exact submission_accepted_as_candidate event
        ↓
strict event payload
└─ candidateId
        ↓
exact candidate_promotion_decisions row
├─ same candidateId
├─ canonical Entity / Location / Claim receipt
└─ promotedAt not before the Suggest decision
        ↓
promoted Candidate
├─ candidateStatus = promoted
├─ canonicalEntityId matches receipt
└─ canonicalLocationId matches receipt
```

Any missing, malformed, mismatched, earlier, or non-promoted link fails closed.

## Lifecycle result

For a pending common application:

```text
pending / blocked
+ exact Candidate promotion receipt
→ committed / pending
```

The transition uses the P5-07B2 lifecycle service and records:

```text
receipt kind = candidate_promotion_decision
receipt IDs = [exact promotion decision UUID]
```

Publication remains pending. P5-07C does not generate or activate an export.

If P5-07B1 registered the application after the Candidate promotion already existed, the application may already be committed with the exact receipt. P5-07C returns `already_bound` without writing a duplicate lifecycle event.

## Replay and conflicts

```text
same binding request UUID + same application + same actor + same receipt
→ replayed lifecycle receipt

same request UUID + changed content
→ idempotency conflict

stale application updatedAt
→ conflict

application already committed to another receipt
→ conflict

missing or mismatched Candidate promotion chain
→ not found or ineligible
```

A concurrent identical commit is recovered through the P5-07B2 durable replay path.

## Authorization

P5-07C uses a separate exact-subject allowlist:

```text
CPM_ADMIN_SUGGEST_APPLICATION_BINDING_SUBJECTS
submission:suggest-application:bind
```

Candidate promotion authority, common registration authority, and generic lifecycle authority do not automatically grant this capability.

## API

```text
POST /admin/api/suggest-applications/:applicationId/bind-promotion
```

The response is private and no-store. It exposes only bounded application, Submission, Candidate, receipt, state, transition, and timestamp identifiers. It does not expose reviewer identity, request fingerprint, Candidate payload, source content, private notes, contact data, Evidence, or provenance detail.

## Explicit non-effects

P5-07C does not:

- create, promote, or link a Candidate;
- create or update Entity, Location, Acceptance Claim, Claim Asset, provenance, Evidence, or Media;
- modify the Suggest Submission decision;
- activate export or release;
- publish any canonical data;
- delete or anonymize private data;
- execute retention;
- expose a public endpoint;
- claim configured deployment or launch readiness.

## Next

P5-07D should implement the still-missing Problem Report correction application and durable negative-report recheck ownership without wrapping existing positive/negative Evidence or Claim mutation transactions in duplicate canonical writes.
