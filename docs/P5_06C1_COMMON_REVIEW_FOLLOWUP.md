# P5-06C1 common review follow-up service and protected API

**Implementation item:** P5-06C1  
**Status:** Implemented; repository validation pending  
**Phase:** Phase 5 — Public submissions / MVP-B

## Purpose

Close the common information-request, Hold, and resume reachability gap identified by P5-06A without moving canonical application, terminal resolution, Media decisions, export, or publication into P5-06C.

P5-06C1 establishes the protected service and HTTP boundary. P5-06C2 will connect bounded reviewer controls and verify cross-submission private-status behavior.

## Covered Submission types

```text
suggest
payment_report
problem_report
photos
```

Business Claims keep their existing P5-04E transition service and are not routed through this API.

## Supported exact-state operations

```text
in_review         -> needs_information
needs_information -> in_review
in_review         -> on_hold
on_hold            -> in_review
```

Every operation requires:

- one UUID request identity;
- the exact Submission type;
- the exact expected workflow state;
- the exact current `updatedAt` value;
- a separately configured review-follow-up subject allowlist;
- atomic workflow-event persistence;
- deterministic replay or a bounded conflict.

## Information requests

Information requests reuse the existing strict private-status payload shape:

```text
submission_information_requested
suggest-information-request-event-v1
```

The legacy schema identifier remains intentional compatibility vocabulary. It does not restrict the event to Suggest Submissions.

The event contains only the bounded requested action and public-safe message. Private reviewer reasoning is not projected.

Resume uses:

```text
submission_information_resumed
```

The resume event contains no copied request text.

## Hold

Hold operations reuse the existing strict private-status payload shape:

```text
submission_hold_started
suggest-hold-event-v1
```

Allowed periods remain:

```text
30 days
60 days
90 days
```

`nextReviewAt` is computed by the server from the committed change time. Reaching that date does not automatically change the Submission state.

Resume uses:

```text
submission_hold_resumed
```

The resume event contains no copied Hold reason, required action, or public message.

## Authorization and route

Environment binding:

```text
CPM_ADMIN_SUBMISSION_REVIEW_FOLLOWUP_SUBJECTS
```

Capability:

```text
submission:review-followup
```

Protected route:

```text
POST /admin/api/review-followup/:submissionId
```

Responses are private and `no-store`. Authorization, malformed input, missing records, stale state, idempotency conflicts, and backend failures use bounded error codes without database or private review detail.

## Explicit non-effects

P5-06C1 does not:

- add public or protected reviewer UI;
- accept submitter follow-up content;
- resolve a Submission;
- approve, reject, restrict, or publish Media;
- apply a canonical field or Claim change;
- create or accept Evidence;
- activate an export or publish data;
- schedule automatic Hold transitions;
- claim deployment or launch readiness.

## Next

P5-06C2 connects information-request, Hold, and resume controls to Suggest, report, and Photos reviewer workspaces and verifies bounded private-status projection across those Submission types.
