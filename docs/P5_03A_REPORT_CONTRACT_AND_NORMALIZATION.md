# P5-03A Payment and problem report contract and normalization boundary

**Implementation item:** P5-03A  
**Status:** Active  
**Last updated:** 2026-07-13

## Purpose

P5-03A defines strict type-specific private intake contracts for target-aware payment reports and problem reports on top of the completed P5-01 Submission foundation and the P5-02 existing-target conventions.

This slice does not add public forms, public HTTP routes, target lookup, reviewer UI, Evidence acceptance, priority mutation, temporary hiding, canonical mutation, export, or publication.

The contract exists so later report surfaces submit one bounded shape that can be normalized into review-safe material without duplicating common privacy, idempotency, abuse-control, status-secret, Audit, or follow-up behavior.

## 1. Shared foundation composition

```text
P5-01 common Submission envelope
+
P5-03A payment_report or problem_report payload
↓
strict type-specific parsing
↓
review-safe report projection
```

Both report families fix:

```text
targetType = entity | location | claim
targetId = required UUID
relationship = null
contact = optional through the common envelope
```

Reports concern an existing canonical target. They cannot use `new_record`, and they cannot omit the target pair.

P5-03A validates the target reference shape only. A later P5-03 slice must verify that the target exists, is the intended public Place or Online Service, and exposes the expected Claim set.

## 2. Payment report contract

The payment report payload uses:

```text
schemaVersion = payment-report-v1
result = successful | failed
paymentDate
payment details
optional private transaction URL
optional notes
```

### Payment details

The bounded payment object contains:

```text
assetSlug
networkSlug
routeType
paymentMethod
processor
context
observedSteps
```

Supported contexts are:

```text
terminal
qr_code
invoice
payment_link
hosted_checkout
other
```

Asset, network, route, method, processor, and context may remain unknown where the submitter did not observe them. At least one concrete payment detail is still required.

The contract preserves `networkSlug = null`; it never infers a network from an asset.

Known route consistency follows the established P5-02 rule:

```text
processor_checkout
→ processor information required

direct_wallet
→ processor information forbidden
```

### Deliberately uncollected fields

The strict payload rejects undeclared fields including:

```text
payment amount
submitter name
wallet address
plaintext transaction ID
account identifier
```

These values are not required for ordinary report intake and must not be introduced through extra keys.

## 3. Payment restricted-evidence boundary

A payment report may contain one optional private transaction URL in the original private payload.

The URL reuses the common safe evidence-URL rules, including blocked local/private hosts and prohibited embedded credentials.

The review-safe projection does not contain the URL. It contains only:

```text
privateTransactionUrlPresent = true | false
```

Receipt images, screenshots, and uploaded evidence remain deferred to the later restricted Media intake boundary. P5-03A does not create an attachment contract prematurely.

## 4. Problem report contract

The problem report payload uses:

```text
schemaVersion = problem-report-v1
reportType
observedAt
explanation
optional structured proposed correction
optional duplicate target
optional private evidence URL
```

Supported report types are:

```text
no_longer_accepts_crypto
business_closed
payment_failed
wrong_asset
wrong_network
wrong_instructions
wrong_address
duplicate
unauthorized_image
privacy_issue
other
```

Explanation is always required and rejects HTML-like text.

## 5. Structured correction proposals

A correction remains a private proposal and never mutates canonical state from intake.

Supported correction kinds are:

```text
asset
network
instructions
location_profile
other
```

Correction-kind compatibility is strict:

```text
wrong_asset        → asset
wrong_network      → network
wrong_instructions → instructions
wrong_address      → location_profile
other              → location_profile | other
```

Other report types cannot attach a structured correction in this slice. Their explanation and evidence remain review material for later protected handling.

### Location profile correction

The `location_profile` correction can propose bounded values for:

```text
address line
locality
region
postal code
country code
latitude and longitude
website
phone
description
opening hours
amenities
social links
```

Rules:

- at least one proposed field is required;
- latitude and longitude must be supplied together when either is proposed;
- country codes use the shared ISO alpha-2 normalization;
- amenities are deduplicated;
- social links reuse the canonical social-link schema and reject duplicates;
- `null` marks a field as not proposed; explicit removal semantics remain a later protected-review decision.

P5-03A does not decide whether a proposed removal is accepted or whether a target class supports every field. Those decisions belong to protected target validation and canonical application slices.

## 6. Duplicate target metadata

A duplicate problem report may optionally identify another existing target using:

```text
targetType = entity | location | claim
targetId = UUID
```

Duplicate-target metadata is rejected on non-duplicate report types.

The duplicate target must not be identical to the report's primary target.

P5-03A does not automatically merge, hide, link, or resolve either target.

## 7. Problem restricted-evidence boundary

A problem report may contain one optional private evidence URL in the original private payload.

The review-safe projection does not contain that URL. It contains only:

```text
privateEvidenceUrlPresent = true | false
```

Privacy, rights, transaction, receipt, wallet, and restricted Media material remain private and require separate protected access in later slices.

## 8. Review-safe normalization

Payment report normalization returns:

```text
reportKind
targetType
targetId
result
paymentDate
payment
notes
evidenceLinks
restricted-evidence presence boolean
```

Problem report normalization returns:

```text
reportKind
targetType
targetId
reportType
observedAt
explanation
proposedCorrection
duplicateTarget
evidenceLinks
restricted-evidence presence boolean
```

Neither projection returns:

```text
contact email
private transaction or evidence URL
status secret
status-token hash
request fingerprint
rate-limit key
remote IP
challenge token
internal Submission UUID
reviewer notes
```

The normalized projections remain private review material.

## 9. Canonical and public boundary

P5-03A deliberately does not implement:

```text
report → Evidence auto-accept
report → Claim status change
report → recheck priority mutation
report → temporary hiding
report → canonical profile update
report → public export or publication
```

A failed payment report does not stale or end a Claim. A privacy or rights report does not automatically hide a record in this slice. A proposed correction does not change an Entity, Location, or Claim.

Later P5-03 decisions must be explicit, protected, auditable, idempotent, and separate from intake.

## 10. Validation coverage

Focused coverage verifies:

1. successful payment report parsing and normalization;
2. failed payment reports with explicit unknown network/route/method values;
3. required existing-target pair and rejection of `new_record`;
4. null relationship for ordinary reports;
5. concrete payment-detail requirement;
6. route and processor consistency;
7. rejection of amount, wallet, transaction-ID, submitter-name, and extra payload fields;
8. wrong-network problem report normalization;
9. bounded location-profile correction normalization;
10. coordinate-pair, empty-correction, and correction-kind rejection;
11. duplicate-target restrictions and self-duplicate rejection;
12. private evidence and contact exclusion from review-safe projections;
13. HTML-like text and extra-key rejection;
14. combined report-family parsing.

`schema:check` includes a focused contract check in addition to the Vitest suite.

## 11. Completion boundary

P5-03A is complete when:

- both report-family schemas and review-safe normalizers are merged;
- focused tests and schema checks pass;
- tracking identifies the next bounded P5-03 slice;
- no route, form, target lookup, Evidence decision, priority mutation, temporary hiding, canonical mutation, export, or publication behavior is added.

## Next

Proceed to P5-03B for idempotent private report intake integration using the existing P5-01 service boundary. Target existence and Claim-context lookup remain a separate later slice rather than being hidden inside the type contract.
