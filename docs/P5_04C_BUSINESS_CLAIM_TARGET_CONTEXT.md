# P5-04C Business claim target context and read-only signals

**Implementation item:** P5-04C  
**Status:** Completed through #208  
**Started:** 2026-07-14  
**Completed:** 2026-07-14

## Purpose

Provide protected reviewers with a bounded canonical snapshot of the Entity or Location named by a private business Claim and deterministic read-only comparison signals before any ownership-verification decision exists.

## Input boundary

P5-04C consumes only the review-safe P5-04A projection persisted by P5-04B.

Required identity:

```text
targetType = entity | location
targetId = existing canonical UUID
```

The service does not require or return:

- plaintext contact email;
- private proof URL;
- assisted-verifier reference value;
- status secret;
- abuse-control identity;
- arbitrary original-payload serialization.

## Canonical target snapshot

The bounded response includes only validated review material such as:

- target Entity identity, type, status, visibility, official website, country, and update version;
- target Location identity, parent Entity, status, visibility, address, coordinates, website, practical profile, and update version when the target is a Location;
- relevant current Acceptance Claim summaries needed to understand payment-information proposals;
- canonical public path when one can be derived safely;
- explicit coverage metadata.

A Location target must belong to the returned Entity. An Entity target cannot be represented as a Location target. Claim context must belong to the same canonical target boundary.

## Read-only signals

P5-04C derives bounded reviewer signals for:

- target identity and scope consistency;
- official-domain comparison against canonical website identity without returning the contact email;
- official website comparison;
- official social-link comparison when canonical Location social data is available;
- proposed Entity-field comparisons;
- proposed Location-field comparisons, including explicit clear requests;
- payment proposal similarities against relevant canonical Claims;
- target visibility and lifecycle cautions;
- incomplete comparison coverage.

Signals are advisory review material only. They do not prove ownership, authority, business control, payment acceptance, or factual correctness.

## Coverage semantics

The response states whether target lookup and each comparison class completed.

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
- Claim ownership mismatch;
- backend failure;
- malformed canonical material;
- malformed response projection.

Failures use bounded codes and do not expose SQL, configuration, protected contact, private proof, or internal stack content.

## Non-effects

P5-04C does not:

- send verification challenges;
- approve or reject authority;
- create a representative relationship;
- grant editing rights;
- mutate Entity, Location, Acceptance Claim, Evidence, or Media data;
- change Submission workflow state;
- create export or publication state.

## Completion evidence

Pull request #208 completed with successful formatting, lint, Astro and TypeScript checks, runtime schema checks including the executable P5-04C check, migration drift validation, unit and component tests, build validation, accessibility checks, staging artifact validation, and representative screenshot capture.

## Completion gate

Given a valid received business Claim, a protected caller can obtain one validated canonical target snapshot and bounded read-only comparison signals while all private verification values remain outside the response and no state changes occur.

## Next

P5-04D exposes the validated P5-04C context through a protected Claim reviewer queue and detail entry. Ownership-verification decisions remain later separately authorized slices.
