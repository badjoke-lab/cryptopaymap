# P5-02E guarded Suggest review transitions

**Implementation item:** P5-02E  
**Status:** Active  
**Last updated:** 2026-07-10

## Purpose

P5-02E adds the first protected write boundary to Suggest review.

The slice is intentionally narrow:

```text
received → triage
triage → in_review
```

It does not add duplicate decisions, information requests, hold behavior, final resolution, Candidate creation, canonical target selection, Evidence acceptance, canonical application, export, or publication.

## 1. Separate write capability

P5-02E introduces a write-specific allowlist:

```text
CPM_ADMIN_SUBMISSION_TRANSITION_SUBJECTS
```

Authorized verified identities receive:

```text
submission:transition
```

This is separate from:

```text
submission:read
```

A reviewer who can read the Suggest queue and detail does not automatically gain workflow transition capability.

## 2. Supported actions

P5-02E supports exactly:

```text
begin_triage
expected: received
result: triage
event: submission_triage_started
```

and:

```text
begin_review
expected: triage
result: in_review
event: submission_review_started
```

The request schema rejects action/expected-status mismatches.

## 3. Exact-state guard

Every request carries:

```text
requestId
expectedStatus
expectedUpdatedAt
```

The transition uses the existing P5-01 atomic persistence guard:

```text
submission id
+
expected workflow status
+
expected updated_at
```

The guarded batch:

1. verifies exact current state;
2. updates the Submission workflow status and updated time;
3. inserts the corresponding Submission event;
4. rolls the complete operation back on conflict.

## 4. Durable replay identity

P5-02E does not add a new database column.

The request UUID is used as the deterministic `submission_events.id` for the transition event.

Therefore:

```text
same request UUID
+
same submission
+
same action/from/to
+
same actor
→ replay original durable event receipt
```

A request UUID already used for a different operation returns:

```text
idempotency_conflict
```

The API maps stale-state conflicts and request-ID reuse conflicts to one bounded `409` response without exposing private conflict detail.

## 5. Concurrent retry recovery

Before commit, the service checks for an existing event with the request UUID.

If the atomic persistence call conflicts, the service reads the event again.

If a concurrent identical request committed the exact expected event, the request returns:

```text
state = replayed
```

If no matching event exists, the request remains a conflict.

This prevents an identical retry from creating a second workflow event while preserving stale-state rejection.

## 6. Suggest-only boundary

The transition service loads the current private Submission state and verifies:

```text
submissionType = suggest
```

A different Submission family is not transitioned through this P5-02 slice.

## 7. Audit history

The transition writes normal durable `submission_events` records.

The existing Submission Audit source already reads this table and projects:

- public Submission reference;
- Submission type;
- from status;
- to status;
- action;
- reason code;
- actor metadata;
- occurred time.

P5-02E therefore reuses the existing durable Audit source rather than creating a second audit store.

## 8. API boundary

Route:

```text
POST /admin/api/submissions/:submissionId/transition
```

Requirements:

- verified Admin identity;
- exact transition subject allowlist membership;
- JSON request body;
- valid Submission UUID;
- valid versioned transition request;
- Suggest-only state;
- exact expected status and timestamp.

Bounded responses:

```text
200 committed or replayed
400 invalid request
403 denied
404 Suggest submission not found
409 transition conflict
415 JSON required
503 unavailable
```

Admin security headers remain private/no-store and noindex.

## 9. Reviewer UI

The protected Suggest detail page now has a separate guarded action panel.

Current action display:

```text
received → Start triage
triage → Begin review
other statuses → no action in this slice
```

The UI sends:

- a fresh request UUID;
- the exact current status;
- the exact current `updatedAt` from the protected detail response.

After a successful commit or replay, the action panel reloads current protected detail state.

Conflict messaging instructs the reviewer to reload instead of pretending the local action succeeded.

## 10. Tests and checks

Coverage verifies:

1. received → triage commit mapping;
2. triage → in_review commit mapping;
3. exact command state and event action;
4. identical request UUID replay;
5. request UUID reuse conflict;
6. stale expected state conflict;
7. non-Suggest isolation;
8. concurrent identical commit replay recovery;
9. persistence conflict without event remains conflict;
10. write authorization before runner access;
11. JSON media type requirement;
12. route parameter validation;
13. bounded conflict response;
14. generic backend failure response;
15. runtime schema and transition command check;
16. staging artifact markers for separated read signals and guarded transitions.

## 11. Out of scope

P5-02E does not add:

- public Suggest form;
- public Suggest intake HTTP route;
- information request;
- submitter response;
- hold action;
- duplicate decision;
- accepted-as-Candidate transaction;
- canonical target selection mutation;
- existing-target linking mutation;
- Evidence acceptance;
- final resolution;
- canonical application transaction;
- export;
- publication.

## 12. Completion criteria

P5-02E is complete when:

1. write capability is separate from read capability;
2. only the two bounded workflow actions are accepted;
3. expected status and updated time are exact-state guarded;
4. workflow update and event insert remain atomic;
5. durable request UUID replay works without a new database column;
6. request UUID reuse with different operation fails;
7. concurrent identical commit can recover as replay;
8. non-Suggest submissions cannot use this action boundary;
9. transition events remain visible through existing Submission Audit history;
10. focused tests, runtime checks, and full repository validation are green.

## Next

After P5-02E merges green, continue P5-02 with the next bounded reviewer operation slice. Information request, hold, duplicate resolution, accepted-as-Candidate, and canonical application must remain separately reviewable operations rather than one broad mutation endpoint.
