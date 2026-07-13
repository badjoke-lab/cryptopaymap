# P5-03C Report target context and Claim signals

**Implementation item:** P5-03C  
**Status:** Active  
**Last updated:** 2026-07-13

## Purpose

P5-03C adds a read-only boundary that resolves the canonical target named by a payment or problem report and reduces its Entity, Location, and Claim context to a bounded protected-review response.

The slice answers three questions before protected report review begins:

1. does the submitted target identity exist;
2. what public Entity, Location, or selected Claim does it identify;
3. which existing Claims share observable payment details with the report.

P5-03C does not update canonical data, Claim state, Evidence, reconfirmation, priority, visibility, Candidate state, export, or publication.

## 1. Backend contract

The context generator depends on one read-only backend operation:

```text
loadTarget(targetType, targetId)
```

The backend returns either:

- one bounded canonical target material object; or
- `null` when the target does not exist.

The material contains only reviewer-safe canonical fields for:

- the owning Entity;
- the Location when applicable;
- the relevant Claim set;
- the selected Claim ID when the report directly targets a Claim.

Database errors are converted to a bounded `backend_failure`. Raw provider or SQL detail does not enter the response.

## 2. Target identity validation

Supported targets remain:

```text
entity
location
claim
```

The response fails closed unless:

- an Entity target ID equals the returned Entity ID;
- a Location target ID equals the returned Location ID;
- the Location belongs to the returned Entity;
- a Claim target ID equals the selected Claim ID;
- the selected Claim exists in the returned Claim set;
- every Claim belongs to the returned Entity;
- every location-specific Claim matches the returned Location;
- Claim IDs and payment-option identities are unique;
- route and processor requirements remain internally consistent.

Malformed or mismatched backend material produces `invalid_response` rather than a partial context.

## 3. Public target snapshot

The bounded target snapshot includes:

```text
target type
target ID
canonical public path when one exists
Entity public-safe fields
Location public-safe fields when applicable
selected Claim ID when applicable
```

Path derivation is deterministic:

```text
Location target or location-specific Claim
→ /place/{location.slug}

Online Service Entity or Claim
→ /service/{entity.slug}

Merchant Entity without a Location path
→ null
```

The response does not contain private source records, reviewer notes, contact data, status secrets, request fingerprints, raw SQL values, or restricted evidence URLs.

## 4. Public reportability

Target existence and public reachability are separate.

The response records:

```text
publiclyReachable
reasons[]
```

Bounded reason codes cover:

```text
missing_public_path
entity_not_public
entity_not_active
location_not_public
location_not_active
claim_not_public
claim_not_reportable_status
```

This is a read-only eligibility signal for later routes and reviewer surfaces. It does not hide, unhide, activate, close, end, confirm, stale, or reject any record.

## 5. Claim context

Claim snapshots retain bounded review facts:

```text
Claim ID
Entity and optional Location ownership
Claim scope
route type
acceptance scope
Claim status
visibility
processor name
confirmation/review timestamps
payment options
```

Sensitive or verbose canonical values such as `howToPay` and `restrictions` are validated by the backend-material schema but omitted from the reduced response. Their use requires a later protected detail boundary.

## 6. Payment-report match signals

For payment reports, the response may attach these review-only reasons to an existing Claim:

```text
selected_target_claim
target_level_claim_context
same_route_type
same_asset
same_network
same_payment_method
same_processor_name
```

These signals are exact comparisons against explicitly observed report values. Unknown report fields produce no match and are never inferred.

A Claim can still appear with only `target_level_claim_context`, showing that it belongs to the resolved target without asserting payment-option equivalence.

## 7. Problem-report Claim signals

Problem reports concerning:

```text
no_longer_accepts_crypto
payment_failed
wrong_asset
wrong_network
wrong_instructions
```

may attach:

```text
problem_may_affect_payment_claim
```

This means only that the Claim is relevant context for protected review.

It does not recommend or apply:

```text
candidate → confirmed
confirmed → stale
stale → ended
visibility change
priority change
Evidence acceptance
```

Privacy, duplicate, address, business-closure, unauthorized-image, and other non-payment problem types do not receive this payment-Claim reason automatically.

## 8. Coverage semantics

Every successful response records:

```text
targetLookupComplete = true
claimContextComplete = true
absenceIsConclusive = false
```

Even a complete bounded lookup is not proof that no other public or private evidence exists. Missing match reasons never justify automatic Claim mutation.

## 9. Error boundary

P5-03C exposes only:

```text
invalid_projection
target_not_found
backend_failure
invalid_response
```

Invalid timestamps, absent targets, backend exceptions, ownership mismatches, invalid Claim scopes, duplicate option identities, and inconsistent processor routes all fail closed.

## 10. Validation coverage

Focused tests prove:

1. public Location resolution and canonical path derivation;
2. exact payment Claim match reasons;
3. selected Claim targeting without state recommendation;
4. Online Service Entity path derivation;
5. hidden, ended, closed, and candidate target reportability reasons;
6. omission of `howToPay`, restrictions, priority, and recommendations;
7. non-conclusive absence of payment matches;
8. non-payment problem types do not imply Claim-state impact;
9. bounded not-found and backend errors;
10. fail-closed target identity and ownership validation.

`schema:check` includes a bounded target-context fixture.

## 11. Completion boundary

P5-03C is complete when:

- the read-only target backend contract and bounded response schema are merged;
- Entity, Location, and Claim target identities are validated;
- canonical paths and public reportability are reduced without mutation;
- exact payment and problem Claim-context reasons are generated;
- absence remains explicitly non-conclusive;
- focused tests and schema checks pass;
- no route, form, reviewer decision, Evidence action, priority mutation, visibility mutation, canonical mutation, export, or publication is added.

## Next

Proceed to P5-03D for the protected report reviewer queue and detail-entry projection. P5-03D may consume P5-03B private payloads and P5-03C target context, but it must remain read-only with respect to Claim state and canonical targets.
