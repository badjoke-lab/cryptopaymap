# P5-02G time-bounded Suggest Hold

**Implementation item:** P5-02G  
**Status:** Active  
**Last updated:** 2026-07-10

## Purpose

P5-02G adds one bounded reviewer pause operation:

```text
in_review
↓
time-bounded Hold
↓
on_hold
↓
private submitter status shows
required action + public message + next review time
```

Indefinite Hold is not supported.

## 1. Authorization

P5-02G reuses the separate Submission write capability:

```text
CPM_ADMIN_SUBMISSION_TRANSITION_SUBJECTS
submission:transition
```

Read-only reviewers do not gain Hold capability automatically.

## 2. Hold periods

The request accepts exactly:

```text
30 days
60 days
90 days
```

The reviewer does not supply an arbitrary absolute deadline.

The server computes:

```text
nextReviewAt = changedAt + holdDays
```

using UTC date arithmetic.

## 3. Request contract

Version:

```text
suggest-hold-v1
```

Required fields:

- request UUID;
- `expectedStatus = in_review`;
- exact `expectedUpdatedAt`;
- `holdDays` equal to 30, 60, or 90;
- internal Hold reason;
- required action before or at the next review;
- safe public status message.

Text is bounded, non-empty, and rejects HTML-like angle-bracket input.

## 4. Durable Hold event

The operation writes:

```text
action = submission_hold_started
from = in_review
to = on_hold
```

The event note stores one strict versioned JSON envelope:

```text
suggest-hold-event-v1
holdDays
nextReviewAt
holdReason
requiredAction
publicMessage
```

The event remains the durable history and replay source.

## 5. Privacy boundary

Private submitter status never serializes arbitrary event notes.

When current status is `on_hold`, persistence:

1. loads the latest `submission_hold_started` event;
2. strictly parses the versioned Hold envelope;
3. projects only:
   - required action into `requestedAction`;
   - public message;
   - `nextReviewAt`.

The internal Hold reason is not projected to the submitter.

If current status is no longer `on_hold`, old Hold text and timing are suppressed.

## 6. Exact-state and replay behavior

The service requires:

```text
submissionType = suggest
workflowStatus = in_review
updatedAt = expectedUpdatedAt
```

The request UUID becomes the deterministic event ID.

Identical replay requires the same:

- Submission;
- actor;
- from/to states;
- event action;
- Hold period;
- Hold reason;
- required action;
- public message.

Different semantics with the same request UUID fail as idempotency conflict.

If atomic persistence conflicts, the service rechecks the event. A concurrent identical commit returns `replayed`; otherwise the conflict remains.

## 7. Protected API

Route:

```text
POST /admin/api/submissions/:submissionId/hold
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

Backend details and private event content are not exposed in failure responses.

## 8. Reviewer UI

The protected Suggest detail page contains a separate Hold panel.

The panel appears as actionable only when current protected detail reports:

```text
workflowStatus = in_review
```

The reviewer selects 30, 60, or 90 days and supplies:

- internal Hold reason;
- required action;
- public status message.

After commit or replay, current protected state is re-read.

## 9. Validation coverage

P5-02G verifies:

1. in-review to on-hold commit;
2. server-computed next review date;
3. 30/60/90 day allowlist;
4. rejection of other durations;
5. exact-state guard;
6. Suggest-only isolation;
7. strict Hold event envelope;
8. identical replay;
9. changed-semantics UUID conflict;
10. concurrent identical replay recovery;
11. conflict without matching event remains conflict;
12. write authorization before backend access;
13. JSON and route parameter validation;
14. bounded API conflict and failure responses;
15. safe private-status Hold projection;
16. suppression after leaving on-hold;
17. runtime checks;
18. additive staging artifact checks;
19. full repository validation.

## 10. Out of scope

P5-02G does not add:

- automatic Hold expiry transition;
- scheduled review runner;
- submitter response intake;
- duplicate resolution;
- accepted-as-Candidate transaction;
- canonical target selection;
- Evidence acceptance;
- final resolution;
- canonical application transaction;
- public Suggest form or route wiring;
- export;
- publication.

The next review date is durable review scheduling data; P5-02G does not claim that a cron or queue automatically changes state when that date arrives.

## 11. Completion criteria

P5-02G is complete when:

1. only in-review Suggest submissions can enter Hold through this operation;
2. every Hold has 30, 60, or 90 day duration;
3. next review time is server-computed;
4. Hold reason, required action, and public message are durable;
5. internal reason cannot leak into private status;
6. private status returns safe Hold text and next review time only while on-hold;
7. exact-state conflict and replay behavior are enforced;
8. reviewer UI is connected without later mutation controls;
9. focused tests, runtime checks, staging checks, and full CI are green.

## Next

After P5-02G merges green, continue with the next bounded reviewer operation. Duplicate resolution, accepted-as-Candidate, and canonical application must remain separately guarded operations.
