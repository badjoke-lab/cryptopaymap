# P5-03G Problem correction and urgent visibility decisions

**Implementation item:** P5-03G  
**Status:** Active  
**Last updated:** 2026-07-13

## Purpose

P5-03G adds separately authorized, idempotent, atomic decisions for reviewed problem reports without allowing a public report to mutate canonical data by itself.

The boundary separates ordinary review from urgent Claim mutation.

```text
problem decision permission
→ correction handoff
→ duplicate resolution
→ no-change resolution
```

```text
urgent visibility permission
→ restricted closure/privacy/rights report
→ temporary Claim hiding only
```

```text
urgent visibility permission
+ P5-03F accepted contradicting Evidence
+ P5-03F durable negative-Evidence decision event
→ explicit mark-stale or end decision
```

## Authorization

Two exact verified-subject policies are required:

```text
CPM_ADMIN_PROBLEM_DECISION_SUBJECTS
submission:problem:decide
```

```text
CPM_ADMIN_URGENT_VISIBILITY_SUBJECTS
submission:urgent-visibility:decide
```

Ordinary problem-review permission cannot hide, stale, or end a Claim. Urgent permission does not bypass report, Claim, or Evidence consistency checks.

## Operations

### Correction handoff

`approve_correction_handoff` requires:

- an `in_review` `problem_report`;
- exact Submission and payload versions;
- strict original and normalized report agreement;
- a typed `proposedCorrection` allowed by the report contract.

The operation resolves the Submission as approved and stores the typed correction in a durable decision event. It does not modify Entity, Location, Claim, payment options, provenance, export, or publication. Canonical application remains assigned to P5-07.

### Duplicate resolution

`resolve_duplicate` requires:

- `reportType = duplicate`;
- a strict stored duplicate target;
- a target different from the report target itself;
- a current non-deleted Entity, Location, or Claim target;
- an atomic target-existence guard at commit.

The Submission becomes `duplicate / duplicate`. Canonical records are not merged or deleted.

### No-change resolution

`resolve_no_change` resolves an eligible reviewed problem report as `resolved / no_change`. It writes no canonical or Claim mutation.

### Urgent temporary hiding

`temporarily_hide_claim` is limited to:

- `business_closed`;
- `privacy_issue`;
- `unauthorized_image`.

It additionally requires restricted private evidence in the original payload, exact target-to-Claim ownership, a current non-deleted confirmed or stale Claim, exact Claim version, and current public visibility.

The atomic outcome is:

```text
Claim visibility: public → temporarily_hidden
Verification Event: hidden
Submission: in_review → resolved / approved
```

Claim status is unchanged. The operation cannot end a Claim.

### Negative Evidence Claim action

`apply_negative_claim_action` operates only after P5-03F has already resolved a failed payment or negative payment problem report and created accepted contradicting Evidence linked to the same Submission and Claim. The P5-03F durable `negative_report_evidence_decided` event must also exist with an accepted-negative-Evidence reason. A generic contradicting Evidence row is insufficient.

Allowed actions are:

```text
confirmed → stale
confirmed|stale → ended
```

Mark-stale requires a `nextReviewAt` after the actual decision time. End requires an ended reason and clears `nextReviewAt`.

The atomic outcome includes a status Verification Event and a `contradiction` Evidence relationship. A retained Submission event supplies idempotent replay and operator attribution.

## Projection integrity

Every decision revalidates:

- Submission type, target type, and target ID;
- strict original and normalized schemas;
- report type or failed-payment result;
- observation date;
- payment details where applicable;
- explanation or notes;
- proposed correction;
- duplicate target;
- restricted-evidence presence;
- exact Submission, payload, Claim, and Evidence versions required by the operation;
- exact report-target-to-Claim ownership again at commit;
- P5-03F negative-Evidence event provenance for Claim status actions.

A malformed or divergent projection fails closed.

## Idempotency

The reviewer request UUID is also the durable Submission event ID. A strict versioned event envelope retains the normalized request fingerprint and deterministic Verification Event ID.

```text
same UUID + same normalized request → replayed receipt
same UUID + changed request content → conflict
```

Concurrent unique or guard conflicts roll back the complete batch before bounded replay recovery.

## Boundaries

P5-03G adds no:

- public payment or problem form;
- automatic decision from user content;
- automatic canonical correction;
- automatic Claim ending;
- Entity or Location deletion or merge;
- public Evidence creation;
- unhide or publication decision;
- export or release mutation.

Configured Cloudflare Access and live Neon execution remain deferred to P5-03I.

## Repository verification boundary

Repository validation covers strict schemas, authorization ordering, projection integrity, duplicate-target checks, idempotency, atomic transaction construction, focused tests, build, accessibility, staging artifacts, and migration drift. It does not prove configured Access or live Neon execution.

## Next

After P5-03G merges green, proceed to P5-03H public payment/problem routes and forms. P5-03I remains the configured review and integration audit.
