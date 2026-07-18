# P5-07D2 durable negative recheck application projection

**Implementation item:** P5-07D2  
**Status:** Active  
**Last updated:** 2026-07-18

## Purpose

P5-07D2 closes the priority-recheck application question without creating a second queue or Claim deadline.

P5-03F already persists the authoritative signal as:

```text
accepted non-deleted contradicting Evidence
+
negative_report_evidence_decided Submission event
+
reason = negative_evidence_recheck_priority
+
decision = accept_and_prioritize_recheck
```

P3-09C already projects that signal into the protected reconfirmation queue and considers it resolved after a later qualifying Verification Event.

P5-07D2 binds those existing owners to the P5-07 common application lifecycle through a protected, bounded, read-only projection.

## No duplicate work-item table

P5-07D2 does not add a `recheck_tasks`, `submission_rechecks`, or equivalent table.

A second durable row would duplicate state already represented by the atomic P5-03F Evidence and Submission event. It would also introduce synchronization questions when Evidence is deleted, a Claim is resolved, or a later Verification Event clears the signal.

The existing durable chain remains authoritative.

## Exact application chain

An application is eligible only when all of the following hold:

1. Submission type is `payment_report` or `problem_report`;
2. source decision kind is `negative_report_evidence`;
3. application kind is `report_evidence`;
4. application status is `committed`;
5. publication status is not `blocked`;
6. application receipt kind is `submission_event`;
7. the single receipt event ID is the exact source decision event ID;
8. Submission is `resolved / approved`;
9. event transition is `in_review → resolved`;
10. event action is `negative_report_evidence_decided`;
11. event reason is `negative_evidence_recheck_priority`;
12. typed event payload decision is `accept_and_prioritize_recheck`;
13. the exact payload Evidence exists and belongs to the same Submission and Claim;
14. Evidence is accepted, contradicting, usage-side, private or restricted, and not deleted;
15. the retained Claim exists and is not deleted;
16. Evidence creation time and decision-event time are identical.

Any broken reference fails closed.

## Active signal

The signal is active when no later Verification Event exists for the same Claim with type:

```text
reconfirmed
restored
marked_stale
ended
corrected
```

An active signal requires the Claim to remain `confirmed` or `stale`.

The service reuses the existing reconfirmation queue evaluator. It returns the bounded current queue outcome:

- an overdue confirmed Claim remains priority `0` and `mark_stale`;
- otherwise the negative-Evidence signal is priority `5` and `review`;
- no second `nextReviewAt` is introduced.

## Resolved signal

The signal is resolved by the first qualifying Verification Event at or after the Evidence creation time.

The protected projection exposes only:

- Verification Event ID;
- event type;
- effective time.

It does not expose event internal notes or other unrestricted history.

## Protected projection

Dedicated allowlist:

```text
CPM_ADMIN_NEGATIVE_RECHECK_APPLICATION_SUBJECTS
```

Exact capability:

```text
submission:negative-recheck-application:read
```

Protected route:

```text
GET /admin/api/report-applications/:applicationId/recheck-signal
```

Response headers are private and `no-store`.

The projection contains only:

- bounded application identity and publication state;
- exact decision event, Evidence, and Claim identifiers;
- signal time;
- current Claim status, visibility, and next-review time;
- active queue projection or bounded resolving event.

It does not include:

- Evidence summary;
- Evidence source URL;
- reviewer note;
- original or normalized Submission payload;
- contact data;
- status-link material;
- IP, challenge, or rate-limit data;
- Verification Event internal note.

## Explicit exclusions

P5-07D2 adds no:

- new queue row or recheck task;
- Claim update;
- `nextReviewAt` update;
- Evidence mutation or deletion;
- Submission mutation;
- application lifecycle transition;
- public Evidence;
- export or release activation;
- retention execution;
- reviewer UI;
- configured deployment claim.

## Completion criteria

P5-07D2 is complete when:

1. only exact `accept_and_prioritize_recheck` applications project a signal;
2. application receipt, event payload, Evidence, Submission, and Claim are cross-validated;
3. active and resolved states match P3-09C queue resolution semantics;
4. overdue priority `0` is preserved;
5. private Evidence and reviewer material are absent from the projection and bounded errors;
6. no duplicate durable queue state is introduced;
7. focused tests, runtime checks, and normal repository workflows are green.

## Next

P5-07D continues with remaining correction classes that have a safe canonical owner. Asset, network, payment-instruction, country, coordinate, and generic-other corrections remain separate and must not be forced through the practical Location correction boundary.
