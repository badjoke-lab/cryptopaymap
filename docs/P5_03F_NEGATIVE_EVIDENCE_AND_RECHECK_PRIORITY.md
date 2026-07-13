# P5-03F Negative Evidence and priority-recheck decision

**Implementation item:** P5-03F  
**Status:** Active  
**Last updated:** 2026-07-13

## Purpose

P5-03F adds a separately authorized, idempotent, atomic decision boundary for reviewed negative payment material.

Eligible material is limited to:

```text
payment_report with result = failed
```

or:

```text
problem_report with reportType = payment_failed | no_longer_accepts_crypto
```

The reviewer may choose:

```text
accept_negative_evidence
→ accepted private/restricted contradicting Evidence
→ Submission resolved / approved
→ Claim unchanged
```

or:

```text
accept_and_prioritize_recheck
→ accepted private/restricted contradicting Evidence
→ durable Submission decision event
→ Claim appears near the front of the protected recheck queue
→ Claim unchanged
```

No report automatically changes Claim status, visibility, deadline, canonical fields, export, or publication.

## Authorization

A separate exact verified-subject policy is required:

```text
CPM_ADMIN_NEGATIVE_EVIDENCE_SUBJECTS
submission:negative-evidence:decide
```

Submission read, transition, Candidate-create, or positive Evidence permission is insufficient.

## Eligibility and consistency

The decision requires:

- persisted `payment_report` or `problem_report`;
- exact `in_review` Submission state and timestamps;
- strict original and normalized report schemas;
- matching negative result/type, observation date, explanation where applicable, and restricted-evidence presence;
- an existing non-deleted `confirmed` or `stale` Claim;
- exact report-target ownership by Claim, Entity, or Location;
- exact Claim status, visibility, and updated timestamp;
- a unique reviewer request UUID.

`business_closed`, privacy, rights, duplicate, correction, and other urgent visibility categories remain assigned to P5-03G.

## Evidence classes

Class A requires:

- a restricted transaction/evidence URL in the original private payload;
- `visibility = restricted`;
- no Class B independence key.

Class B requires:

- a bounded reviewer-supplied independence key;
- `visibility = private` or `restricted`.

All accepted P5-03F Evidence is:

```text
polarity = contradicting
origin_role = usage_side
review_status = accepted
visibility != public
```

## Priority-recheck signal

P5-03F does not add a second Claim deadline or mutate `nextReviewAt`.

The priority signal is represented by the combination of:

- accepted non-deleted contradicting Evidence linked to the Claim and Submission;
- a durable Submission event with reason `negative_evidence_recheck_priority`.

The protected reconfirmation queue treats an unresolved signal as:

```text
queueReason = negative_evidence
recommendedAction = review
priority = 5
```

An already overdue confirmed Claim remains priority `0` and is not downgraded.

A signal is considered resolved when a later Verification Event exists for the same Claim at or after the negative Evidence creation time. This clears the queue priority without deleting Evidence or rewriting the Submission event.

## Atomic writes

A committed decision atomically writes:

- one accepted contradicting Evidence row;
- Submission `in_review → resolved` with `approved` resolution;
- one durable Submission decision event.

The transaction guards the exact Submission and payload versions plus Claim status, visibility, updated timestamp, and non-deleted state. It does not update the Claim row.

## Idempotency

The request UUID deterministically derives the Evidence ID. The retained Submission event stores a strict versioned decision envelope and request fingerprint.

```text
same UUID + same normalized request → replayed receipt
same UUID + changed request content → conflict
```

A concurrent unique conflict performs bounded replay recovery.

## Boundaries

P5-03F adds no:

- public report route or form;
- automatic Evidence decision;
- public Evidence;
- Claim confirmation, staling, ending, hiding, or unpublishing;
- `nextReviewAt` mutation;
- correction or duplicate decision;
- canonical mutation;
- export or publication.

Configured Cloudflare Access and live Neon transaction execution remain deferred to P5-03I.

## Repository verification boundary

Repository validation covers schemas, authorization ordering, idempotent service behavior, atomic transaction construction, recheck-priority evaluation, unit tests, build, accessibility, staging artifacts, and migration drift. It does not prove configured Cloudflare Access or live Neon execution.

## Next

After P5-03F merges green, proceed to P5-03G for correction, closure, privacy, rights, duplicate, and urgent visibility decision boundaries.
