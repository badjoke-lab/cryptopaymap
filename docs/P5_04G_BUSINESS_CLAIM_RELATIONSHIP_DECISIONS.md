# P5-04G Business Claim representative-relationship decisions

**Implementation item:** P5-04G  
**Status:** Completed through #212  
**Started:** 2026-07-14  
**Completed:** 2026-07-14

## Purpose

Convert reviewed P5-04F verification results into a separately authorized decision about whether a claimant may be recorded as a verified representative of the target Entity or Location, without granting editing rights or applying proposed canonical changes.

## Authorization boundary

P5-04G uses a dedicated relationship-decision capability separate from:

- protected Claim read access;
- ordinary Claim workflow transitions;
- verification preparation;
- verification execution;
- canonical proposal application;
- export and publication.

A passed verification result does not itself authorize a relationship decision. The decision maker must be independently authorized.

## Eligible result boundary

An approval decision requires:

- one existing business Claim Submission in `in_review`;
- one exact expected Submission update timestamp;
- one P5-04F execution-result event owned by the same Submission;
- one valid unexpired preparation chain;
- a `passed` bounded verification outcome;
- matching target type, target ID, method, preparation ID, and execution ID;
- a valid P5-04A review-safe Claim projection;
- one idempotent decision UUID.

Failed, inconclusive, provider-error, malformed, expired, mismatched, or superseded verification results cannot create an approved representative relationship.

## Decision types

The initial decision boundary supports:

```text
approve_relationship
not_approved
```

`approve_relationship` creates one private verified representative-relationship record and resolves the Submission as approved for the relationship scope only.

`not_approved` resolves the Submission without creating a relationship. It requires a bounded reason code and does not imply that the claimant acted maliciously.

## Representative relationship

An approved private record binds:

- relationship ID;
- Submission ID;
- target Entity or Location;
- claimant role;
- approved representative scope;
- verification method;
- preparation event ID;
- execution-result event ID;
- decision event ID;
- decision maker;
- verified and created timestamps;
- relationship status.

Initial relationship status:

```text
active
```

Revocation, expiry, transfer, and account-permission management remain later separately authorized capabilities.

## Scope boundary

P5-04G approves only the representative-relationship scope requested in the normalized Claim. Entity-profile, Location-profile, and payment-information proposals remain pending canonical review and are not applied by the relationship decision.

The relationship record is not an account, session, API credential, or editing permission.

## Persistence and idempotency

Approval or non-approval is one atomic transaction covering:

- exact-state Submission resolution;
- private relationship creation when approved;
- decision event creation;
- audit metadata.

The initial private relationship is stored as a strict versioned decision-event payload bound to the exact verification chain. No public or canonical relationship table is introduced by this slice.

An identical retry replays the stored decision. Reuse of the same decision UUID with changed Submission, verification result, target, decision, reason, or approved scope fails as an idempotency conflict.

## Failure behavior

P5-04G fails closed for:

- unauthorized decision makers;
- missing or non-Claim Submissions;
- stale expected state;
- malformed normalized Claim projections;
- missing representative scope;
- missing, malformed, mismatched, or non-passed verification results;
- changed-content idempotency conflicts;
- transaction or response-validation failure;
- private-value leakage into the decision response or audit summary.

A failed decision does not partially resolve the Submission or create a relationship.

## Non-effects

P5-04G does not:

- grant editing rights;
- create an owner dashboard account;
- apply proposed Entity, Location, payment, Evidence, or Media changes;
- publish the relationship;
- expose claimant contact or proof material;
- create public Evidence;
- export or publish canonical data;
- expose a public Claim route.

## Completion gate

An independently authorized decision maker can approve one exact passed verification result into a private, idempotent representative relationship or resolve the Claim as not approved, while stale, mismatched, unauthorized, malformed, or conflicting decisions fail atomically and no editing or canonical mutation occurs.

## Completion evidence

Pull request #212 adds dedicated decision authorization, strict request, receipt, relationship, and event contracts, exact Projection/preparation/execution-chain validation, atomic guarded Drizzle persistence, deterministic replay, non-approval handling, protected-value rejection, focused unit tests, and an executable schema check.

## Next

P5-04H will review and apply approved Claim field proposals through separately authorized field-level canonical transactions. Public Claim intake and configured review remain later slices.
