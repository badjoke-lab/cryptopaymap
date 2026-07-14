# P5-04B Business claim private intake integration

**Implementation item:** P5-04B  
**Status:** Active  
**Started:** 2026-07-14

## Purpose

Integrate the hardened P5-04A business Claim parser and review-safe normalization with the shared idempotent private Submission persistence foundation.

## Intake sequence

```text
strict business Claim parsing
→ common private Submission envelope
→ deterministic request fingerprint
→ status-secret issuance
→ protected contact encryption and hashing when present
→ atomic private original + normalized payload persistence
→ received workflow state
```

## Private and normalized separation

The private original payload retains the Claim request needed for protected review, including ownership-proof URL, assisted-verification reference, authority statement, proposed corrections, and Evidence links.

The contact email is not stored in either payload document. It is encrypted and hashed through the existing protected `submission_contacts` boundary.

The normalized payload contains only the P5-04A review-safe projection. It excludes:

- contact email value;
- private proof URL value;
- assisted-verifier reference value;
- encrypted contact value;
- status secret;
- abuse-control identity;
- verification success or relationship approval state.

Presence booleans may indicate that protected material exists without exposing its value.

## Official-domain email boundary

Official-domain email verification requires:

- a declared official domain;
- protected contact on that domain or a subdomain;
- permission for follow-up contact.

P5-04B persists the protected request only. It does not send email, validate mailbox control, or approve a representative relationship.

## Correction semantics

The hardened P5-04A contract preserves the difference between:

- a field omitted from the requested correction;
- a nullable field deliberately cleared;
- a list deliberately replaced with an empty list.

Coordinate changes require a complete latitude and longitude pair. P5-04B persists these proposed changes for later review but does not apply them to canonical data.

## Idempotency

```text
same request UUID + same Claim content
→ replay the same public reference and deterministic status secret
→ no second private row

same request UUID + changed Claim content
→ idempotency conflict
→ no changed row
```

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

P5-04C will add protected canonical target context and bounded read-only signals needed for Claim review before any ownership-verification decision is possible.
