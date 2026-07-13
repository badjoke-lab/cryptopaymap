# P5-04B Business claim private intake integration

**Implementation item:** P5-04B  
**Status:** Active  
**Started:** 2026-07-13

## Purpose

Integrate the P5-04A business Claim parser and review-safe normalization with the shared idempotent private Submission persistence foundation.

## Intake sequence

```text
strict business Claim parsing
→ common private Submission envelope
→ deterministic request fingerprint
→ status-secret issuance
→ optional submitter contact protection
→ atomic private original + normalized payload persistence
→ received workflow state
```

## Private and normalized separation

The private original payload retains the Claim request needed for protected review, including official contact material, ownership-proof URL, authority statement, and proposed changes.

The normalized payload contains only the P5-04A review-safe projection. It excludes:

- official contact email value;
- private proof URL value;
- submitter contact value;
- encrypted submitter contact;
- status secret;
- abuse-control identity;
- verification success or relationship approval state.

## Idempotency

```text
same request UUID + same Claim content
→ replay the same public reference and deterministic status secret
→ no second private row

same request UUID + changed Claim content
→ idempotency conflict
→ no changed row
```

## Contact boundary

The common optional submitter contact is encrypted and hashed by the existing contact-protection provider and persisted separately from both payload documents.

The official verification contact remains private Claim material for later verification operations. P5-04B does not contact, validate, or promote it.

## Abuse-control composition

The existing shared wrapper continues to enforce:

```text
rate limit
→ challenge verification
→ Claim private intake
```

P5-04B does not introduce a public route or bypass these controls.

## Authority boundary

A committed private Claim remains:

```text
workflowStatus = received
```

It does not create:

- verified representative status;
- editing permission;
- canonical changes;
- accepted Evidence;
- export or publication state.

## Next

P5-04C will add protected target context and read-only signals needed for Claim review before any ownership-verification decision is possible.
