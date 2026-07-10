# P5-02F Suggest information request

**Implementation item:** P5-02F  
**Status:** Active  
**Last updated:** 2026-07-10

## Purpose

P5-02F adds one bounded reviewer follow-up operation:

```text
in_review
↓
request additional information
↓
needs_information
↓
private submitter status shows
requestedAction + publicMessage
```

The operation is separate from hold, duplicate resolution, Candidate creation, canonical application, Evidence acceptance, final resolution, export, and publication.

## 1. Authorization

P5-02F reuses the separate write capability introduced by P5-02E:

```text
CPM_ADMIN_SUBMISSION_TRANSITION_SUBJECTS
submission:transition
```

Read-only Submission reviewers do not gain this capability automatically.

## 2. Request contract

The protected request is versioned:

```text
suggest-information-request-v1
```

It requires:

- request UUID;
- `expectedStatus = in_review`;
- exact `expectedUpdatedAt`;
- bounded `requestedAction` up to 500 characters;
- bounded `publicMessage` up to 1000 characters.

Both text fields must contain non-whitespace text and reject HTML-like angle-bracket input.

## 3. Durable event envelope

P5-02F does not add a second status-message table or overwrite a single current-message column.

The transition writes the normal durable Submission event:

```text
action = submission_information_requested
from = in_review
to = needs_information
```

The event `internal_note` stores one strict versioned JSON envelope:

```text
suggest-information-request-event-v1
requestedAction
publicMessage
```

This preserves history and request replay while keeping the general event-note channel private.

## 4. Safe status projection

The private submitter status path never exposes arbitrary `internal_note` values.

When current workflow status is `needs_information`, persistence:

1. loads the latest `submission_information_requested` event for the Submission;
2. parses its internal note with the strict event-envelope schema;
3. projects only `requestedAction` and `publicMessage` when parsing succeeds.

For all other statuses, both fields are forced to `null` even if an older information-request event exists.

The existing secret-bound private status read remains required before these fields are returned.

## 5. Exact-state and replay behavior

The service requires exact current state:

```text
submissionType = suggest
workflowStatus = in_review
updatedAt = expectedUpdatedAt
```

The request UUID becomes the deterministic transition event ID.

Identical replay requires the same:

- Submission;
- actor;
- from and to states;
- event action;
- requested action text;
- public message text.

Different content with an already-used UUID fails as idempotency conflict.

After an atomic persistence conflict, the service re-reads the request event. A concurrently committed identical operation returns `replayed`; otherwise the request remains a conflict.

## 6. Protected API

Route:

```text
POST /admin/api/submissions/:submissionId/request-information
```

Bounded responses:

```text
200 committed or replayed
400 invalid request
403 denied
404 Suggest submission not found
409 stale-state or idempotency conflict
415 JSON required
503 unavailable
```

The API does not return internal event notes, actor IDs, contact data, status secret material, request fingerprints, or backend error details.

## 7. Reviewer UI

The Suggest reviewer detail page contains a separate information-request panel.

The form is available only while the protected detail reports:

```text
workflowStatus = in_review
```

The reviewer supplies:

- exact requested action;
- public status message.

The form sends the current protected `updatedAt` as its optimistic concurrency guard.

On success, the page re-reads protected detail state. Conflicts tell the reviewer to reload instead of presenting local success.

## 8. Validation coverage

P5-02F verifies:

1. in-review to needs-information commit;
2. exact-state guard;
3. Suggest-only isolation;
4. bounded and non-empty safe text;
5. HTML-like input rejection;
6. strict event-envelope serialization and parsing;
7. identical durable replay;
8. changed-content UUID conflict;
9. concurrent identical commit recovery;
10. conflict without replay event remains conflict;
11. write authorization before backend access;
12. JSON and route parameter validation;
13. bounded API conflict and failure responses;
14. private status projection for needs-information;
15. suppression of old request text for other statuses;
16. runtime contract checks;
17. staging artifact boundary and secret-marker checks;
18. full repository validation.

## 9. Out of scope

P5-02F does not add:

- submitter response intake;
- hold action;
- duplicate decision;
- accepted-as-Candidate transaction;
- canonical target selection;
- existing-target linking;
- Evidence acceptance;
- final resolution;
- canonical application transaction;
- public Suggest form or route wiring;
- export;
- publication.

## 10. Completion criteria

P5-02F is complete when:

1. only in-review Suggest submissions can enter needs-information through this operation;
2. request text is bounded and strictly validated;
3. request event history is durable;
4. arbitrary internal notes cannot leak into private status;
5. exact-state conflict handling is enforced;
6. identical replay and concurrent replay recovery work;
7. submitter private status returns only safe request text after valid secret verification;
8. reviewer UI is connected without exposing later mutation controls;
9. focused tests, runtime checks, staging checks, and full CI are green.

## Next

After P5-02F merges green, continue with one bounded reviewer operation at a time. Time-bounded hold and duplicate resolution must remain separate operations with explicit state, guard, replay, Audit, and private-status semantics.
