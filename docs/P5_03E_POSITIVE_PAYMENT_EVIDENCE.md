# P5-03E Positive payment Evidence and reconfirmation decision

**Implementation item:** P5-03E  
**Status:** Active  
**Last updated:** 2026-07-13

## Purpose

P5-03E adds a separately authorized, idempotent, atomic decision boundary for a reviewed successful payment report.

The boundary can produce one of two outcomes:

```text
accept_evidence
successful payment report
→ accepted private/restricted supporting Evidence
→ Submission resolved / approved
→ Claim unchanged
```

```text
accept_and_reconfirm
successful payment report
→ accepted private/restricted supporting Evidence
→ exact current Claim payment match
→ Claim confirmed or stale→confirmed
→ reconfirmed/restored Verification Event
→ Submission resolved / approved
```

No report is accepted or applied automatically.

## Authorization

A separate exact verified-subject policy is required:

```text
CPM_ADMIN_PAYMENT_EVIDENCE_SUBJECTS
submission:payment-evidence:decide
```

Submission read or transition permission alone is insufficient.

## Eligibility

The decision requires:

- a persisted `payment_report`;
- exact `in_review` workflow state and timestamps;
- a strict normalized payment-report projection;
- `result = successful`;
- an existing non-deleted Claim;
- exact target ownership between the report and Claim;
- exact Claim status, visibility, updated time, and Claim Asset ID set;
- a unique reviewer request UUID.

Reconfirmation additionally requires:

- Class A restricted payment proof;
- a separate publication-safe Verification summary;
- submitted route, Asset, Network, and payment method to be present;
- an exact current Claim payment-option match;
- current active publication prerequisites in the atomic database guard;
- exactly one primary Claim payment option;
- a future `nextReviewAt`.

## Evidence classes

Class A payment proof requires:

- a private transaction URL was supplied in restricted Submission storage;
- exact current payment-option match;
- `visibility = restricted`;
- no Class B independence key.

Class B user-report Evidence requires:

- a bounded reviewer-supplied independence key;
- `visibility = private` or `restricted`;
- Evidence-only acceptance. A single Class B report cannot reconfirm a Claim.

For Class A, the restricted transaction URL is read from the original private Submission payload and retained only on restricted Evidence. The normalized reviewer projection continues to expose presence only.

P5-03E never creates public Evidence directly. Evidence summary and public Verification summary are separate fields so restricted review detail cannot become public by reuse.

## Atomic writes

A committed decision atomically writes:

- one accepted supporting Evidence row linked to the Claim and Submission;
- Submission `in_review → resolved` with `approved` resolution;
- one durable Submission decision event.

For reconfirmation it additionally writes:

- Claim `confirmed → confirmed` or `stale → confirmed`;
- updated `lastConfirmedAt` and future `nextReviewAt`;
- `reconfirmed` or `restored` Verification Event;
- Verification Event ↔ Evidence `basis` linkage.

Any guard, constraint, or statement failure rolls back the whole batch.

## Idempotency

The request UUID deterministically derives Evidence and optional Verification Event identifiers. The retained Submission event stores a strict versioned decision envelope and request fingerprint.

```text
same UUID + same normalized request → replayed receipt
same UUID + changed request content → conflict
```

A concurrent unique conflict performs bounded replay recovery before returning a conflict.

## Boundaries

P5-03E does not add:

- public payment-report forms or routes;
- automatic Evidence acceptance;
- public Evidence visibility;
- negative Evidence;
- recheck-priority mutation;
- correction or duplicate decisions;
- temporary hiding;
- arbitrary Claim edits;
- export or publication.

Configured Cloudflare Access and live Neon execution remain deferred to P5-03I during repository-only development.

## Next

After P5-03E merges green, proceed to P5-03F for negative Evidence and priority-recheck decisions. A failed payment report must never use this positive Evidence boundary.
