# P5-02H accepted-as-Candidate transaction

**Implementation item:** P5-02H  
**Status:** Completed through #163
**Last updated:** 2026-07-10

## Purpose

P5-02H adds the explicit outcome required for useful but insufficient Suggest submissions:

```text
in_review Suggest
↓
explicit accepted-as-Candidate decision
↓
private user-submission source record
+
private Candidate
+
origin linkage
+
Submission resolved / accepted_as_candidate
```

This transaction preserves review material without asserting canonical or public truth.

## 1. Scope boundary

P5-02H is not Candidate promotion and is not canonical application.

The new Candidate remains:

```text
candidate_status = new
canonical_entity_id = null
canonical_location_id = null
```

No Acceptance Claim, Evidence acceptance, public export, or publication is created.

## 2. Separate capability

P5-02H introduces a dedicated allowlist:

```text
CPM_ADMIN_SUBMISSION_CANDIDATE_SUBJECTS
```

Authorized identities receive:

```text
submission:candidate:create
```

This capability is separate from:

- `submission:read`;
- `submission:transition`;
- Candidate promotion capabilities.

## 3. User-submission source channel

The protected environment must provide:

```text
CPM_USER_SUBMISSION_SOURCE_ID
```

The atomic transaction verifies that this source:

- exists;
- has `source_type = user_submission`;
- is active.

A missing, invalid, inactive, or wrong-type source channel causes the transaction to fail closed.

## 4. Input material boundary

Candidate creation uses the strict normalized Suggest projection only.

The transaction does not receive or persist into Candidate source material:

- plaintext or encrypted contact data;
- original private payload;
- status secret material;
- request fingerprint;
- rate-limit material;
- challenge tokens;
- arbitrary reviewer data.

The normalized projection is revalidated immediately before transaction planning.

## 5. Request contract

Version:

```text
suggest-accepted-candidate-v1
```

Required fields:

- request UUID;
- `expectedStatus = in_review`;
- exact `expectedUpdatedAt`;
- bounded reason code;
- optional bounded internal note.

Reason codes:

```text
useful_but_incomplete
insufficient_evidence
identity_needs_review
payment_details_incomplete
other
```

## 6. Deterministic private identities

The request UUID deterministically derives:

```text
Candidate ID
Source Record ID
```

The same request therefore cannot create a second private Candidate or source record under retry.

The normalized projection also receives a stable SHA-256 content hash.

## 7. Atomic transaction

The Drizzle backend executes one database batch containing:

1. active `user_submission` source guard;
2. exact Submission status and `updated_at` guard;
3. exact normalized-payload `updated_at` guard;
4. private Source Record insert;
5. private Candidate insert;
6. Candidate-to-Source `origin` linkage insert;
7. Submission update to `resolved / accepted_as_candidate`;
8. durable `submission_accepted_as_candidate` event insert.

A conflict rolls back the complete operation.

## 8. Source Record projection

The source record uses:

- configured user-submission source ID;
- Submission public reference as external source identity;
- strict normalized Suggest projection as private source payload;
- Suggest observation date;
- transaction time as fetch time;
- normalized projection content hash.

The original private Submission payload is not copied.

## 9. Candidate projection

The new Candidate uses:

- `physical_place` or `online_service` from Suggest kind;
- normalized entity name;
- Submission priority;
- Suggest observation time as first/last seen time;
- `candidate_status = new`;
- no duplicate group preassignment;
- no import batch;
- no canonical target.

The Candidate then enters the normal protected Candidate review system.

## 10. Replay and conflict behavior

The request UUID is also the durable Submission event ID.

Exact replay requires the same:

- Submission;
- actor;
- configured source channel;
- accepted-as-Candidate reason;
- optional note;
- event action and state transition.

Different semantics with the same request UUID fail as idempotency conflict.

If atomic persistence conflicts, the service re-reads the event. A concurrent identical transaction returns `replayed`; otherwise the conflict remains.

## 11. Protected API

Route:

```text
POST /admin/api/submissions/:submissionId/accept-candidate
```

Bounded responses:

```text
200 committed or replayed
400 invalid request or invalid normalized projection
403 denied
404 Suggest submission not found
409 stale-state or idempotency conflict
415 JSON required
503 unavailable
```

## 12. Reviewer UI

The Suggest reviewer detail page includes a separate accepted-as-Candidate panel.

The panel is actionable only while current protected status is:

```text
in_review
```

The reviewer chooses a bounded reason and may add an internal note.

After the transaction returns successfully, the UI re-reads protected detail and verifies:

```text
workflowStatus = resolved
resolution = accepted_as_candidate
```

before showing success.

## 13. Audit and private status

The normal durable Submission event remains visible through the existing Submission Audit source.

The submitter private status uses the existing bounded public label:

```text
accepted_as_candidate
```

The private Candidate ID and internal note are not added to the submitter status projection.

## 14. Validation coverage

P5-02H verifies:

1. normalized projection revalidation;
2. private-only Candidate command construction;
3. deterministic Candidate and Source Record IDs;
4. normalized projection content hash;
5. exact Submission state guard;
6. normalized payload version guard;
7. dedicated source-channel configuration;
8. strict user-submission source guard;
9. separate Candidate-create authorization;
10. exact replay;
11. source-channel replay conflict;
12. stale-state conflict;
13. invalid projection rejection;
14. concurrent identical replay recovery;
15. generic API failure mapping;
16. runtime boundary checks;
17. additive staging artifact checks;
18. full repository CI.

## 15. Out of scope

P5-02H does not add:

- duplicate/no-change outcomes;
- Candidate duplicate-group decision;
- Candidate promotion;
- canonical target selection;
- existing-target linking;
- Evidence acceptance;
- canonical application transaction;
- public Suggest route/form wiring;
- export;
- publication.

Duplicate/no-change outcomes remain later review-workflow work. Candidate promotion and canonical application continue through their existing guarded boundaries.

## 16. Completion criteria

P5-02H is complete when:

1. only valid in-review Suggest submissions can enter the transaction;
2. Candidate-create authorization is separate;
3. the configured source channel is atomically verified;
4. only strict normalized Suggest projection becomes source material;
5. Source Record, Candidate, origin link, Submission resolution, and event commit atomically;
6. payload version races fail closed;
7. deterministic replay is safe;
8. no canonical or public record is created;
9. focused tests, runtime checks, staging checks, and full CI are green.

## Next

After P5-02H merges green, wire the public Suggest route/form with real environment-backed providers, then close P5-02 with an integration and handoff audit before P5-03 begins.
