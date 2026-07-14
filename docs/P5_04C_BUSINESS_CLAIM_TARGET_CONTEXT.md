# P5-04C Business claim target context and read-only signals

**Implementation item:** P5-04C  
**Status:** Active  
**Started:** 2026-07-14

## Purpose

Provide protected reviewers with a bounded canonical snapshot of the Entity or Location named by a private business Claim and deterministic read-only comparison signals before any ownership-verification decision exists.

## Input boundary

P5-04C consumes only the review-safe P5-04A projection persisted by P5-04B.

Required identity:

```text
targetType = entity | location
targetId = existing canonical UUID
```

The service must not require or return:

- plaintext contact email;
- private proof URL;
- assisted-verifier reference value;
- status secret;
- abuse-control identity;
- arbitrary original-payload serialization.

## Canonical target snapshot

The bounded response may include:

- target Entity identity, type, status, visibility, official website, country, and update version;
- target Location identity, parent Entity, status, visibility, address, coordinates, website, practical profile, and update version when the target is a Location;
- relevant current Acceptance Claim summaries needed to understand payment-information proposals;
- canonical public path when one can be derived safely;
- explicit coverage metadata.

A Location target must belong to the returned Entity. An Entity target must not be represented as a Location target.

## Read-only signals

P5-04C may derive bounded reviewer signals for:

- target identity and scope consistency;
- official-domain comparison between protected contact metadata and canonical website identity without returning the email value;
- official website comparison;
- official social-link comparison when the Claim method uses an official social account;
- proposed Entity-field differences;
- proposed Location-field differences;
- proposed payment-information differences against relevant canonical Claims;
- target visibility or lifecycle conditions that require reviewer caution;
- incomplete comparison coverage.

Signals are advisory review material only. They do not prove ownership, authority, business control, payment acceptance, or factual correctness.

## Coverage semantics

The response must state whether target lookup and each comparison class completed.

A zero-match result is not automatically conclusive. The initial contract uses:

```text
absenceIsConclusive = false
```

unless a later bounded adapter can prove complete authoritative coverage.

## Failure behavior

The protected service fails closed for:

- malformed normalized Claim projection;
- missing canonical target;
- target/parent mismatch;
- backend failure;
- malformed canonical material;
- malformed response projection.

Failures use bounded codes and must not expose SQL, configuration, protected contact, private proof, or internal stack content.

## Non-effects

P5-04C does not:

- send verification challenges;
- approve or reject authority;
- create a representative relationship;
- grant editing rights;
- mutate Entity, Location, Acceptance Claim, Evidence, or Media data;
- change Submission workflow state;
- create export or publication state.

## Completion gate

Given a valid received business Claim, a protected caller can obtain one validated canonical target snapshot and bounded read-only comparison signals while all private verification values remain outside the response and no state changes occur.

## Next

P5-04D will expose the validated P5-04C context through a protected Claim reviewer queue and detail entry. Ownership-verification decisions remain later separately authorized slices.
