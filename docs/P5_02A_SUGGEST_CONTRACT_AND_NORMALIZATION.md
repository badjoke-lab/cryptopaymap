# P5-02A Suggest contract and normalization boundary

**Implementation item:** P5-02A  
**Status:** Completed through #156
**Last updated:** 2026-07-10

## Purpose

P5-02A defines the type-specific private intake contract for suggesting a new physical Place or Online Service on top of the completed P5-01 shared Submission foundation.

This slice does not add public forms, public HTTP routes, Candidate creation, duplicate detection, reviewer UI, canonical mutation, export, or publication.

The contract exists to ensure that later public Suggest surfaces submit one strict shape that can be normalized into review-safe proposal data without duplicating common Submission privacy, idempotency, abuse-control, status-secret, Audit, or follow-up logic.

## 1. Shared foundation composition

Suggest intake composes P5-01 rather than replacing it.

```text
P5-01 common Submission envelope
+
P5-02A Suggest type-specific payload
↓
strict Suggest parsing
↓
review-safe normalized proposal
```

The type-specific contract fixes:

```text
submissionType = suggest
targetType = null
targetId = null
relationship = required
```

P5-02A is for new-record suggestions. Existing-record corrections belong to later report/claim workflows and must not be smuggled through Suggest by attaching a canonical target.

## 2. Suggestion kinds

The contract supports exactly:

```text
physical_place
online_service
```

Normalization derives the intended canonical identity class:

```text
physical_place → merchant
online_service → online_service
```

This is only a review proposal type. It does not create the canonical Entity or Location.

## 3. Shared identity proposal

Both suggestion kinds include a proposed entity identity:

```text
name
legalName
websiteUrl
countryCode
```

Rules:

- name is required;
- legal name is optional;
- website URL, when supplied, must be HTTPS;
- country code is normalized through the shared ISO alpha-2 contract;
- Online Service suggestions require an official HTTPS website URL;
- physical Place suggestions may omit an entity website when other reviewable identity/location material exists.

## 4. Physical Place proposal

A physical Place proposal may include:

```text
branchName
addressLine
locality
region
postalCode
countryCode
latitude
longitude
websiteUrl
phone
description
openingHours
amenities
socialLinks
```

The schema reuses the canonical practical-profile limits for social links and compatible field bounds.

### Address and coordinates

The contract supports reviewable incomplete location material.

Accepted examples:

```text
address present
coordinates absent
```

or:

```text
address absent
latitude + longitude present
```

Rejected examples:

```text
address absent
coordinates absent
```

or:

```text
latitude only
```

or:

```text
longitude only
```

Latitude and longitude remain range checked.

This preserves useful but incomplete suggestions for protected review instead of pretending they satisfy canonical Location completeness.

## 5. Practical profile proposal

P5-02A accepts bounded proposals for:

- phone;
- opening hours;
- official social links;
- amenities;
- description;
- Place-specific official website.

Amenities are deduplicated during parsing.

Social links reuse the canonical social-link schema and reject duplicate platform/URL pairs.

These are proposed review values only. P5-02A does not write them to canonical Location state.

## 6. Category proposal

Category proposals contain:

```text
slug
isPrimary
```

Rules:

- up to 20 proposals;
- duplicate slugs are rejected;
- at most one proposed primary category;
- an empty category list is allowed.

An empty list is intentional: useful Suggest intake may not know the correct taxonomy. Protected review may classify it later.

## 7. Payment proposal

Each Suggest submission requires at least one payment proposal because the product is about actual crypto payment acceptance.

A payment proposal may contain:

```text
assetSlug
networkSlug
routeType
paymentMethod
processor
contractAddress
howToPay
restrictions
isPrimary
```

Asset, network, route, and method may remain unknown at intake time.

At least one concrete payment detail is required in each proposal. The contract therefore accepts reviewable partial material such as:

```text
asset = usdt
network = unknown
route = unknown
method = unknown
howToPay = submitter observation
```

The contract preserves `network = null`. It never infers a network from the asset.

## 8. Route and processor rules

When the submitter claims a known route:

```text
processor_checkout
→ processor proposal required

direct_wallet
→ processor proposal forbidden
```

When route type is unknown, processor metadata may still be supplied for review without forcing a route classification.

This keeps intake factual uncertainty explicit while preventing internally contradictory known-route proposals.

## 9. Payment proposal collection rules

The collection is bounded to 1–20 proposals.

Rules:

- exact duplicate proposal content is rejected;
- at most one option may be marked primary;
- zero primary options is allowed;
- multiple primary options are rejected.

A submitter who does not know which payment option is primary is not forced to invent one.

## 10. Observation and evidence

The type-specific payload includes an observation date.

Evidence links remain in the P5-01 common envelope and reuse its URL and text safety boundary.

Normalization joins the type-specific proposal with:

```text
relationship
evidenceLinks
```

without moving contact information into the review-safe proposal object.

## 11. Review-safe normalization output

P5-02A normalization returns:

```text
suggestionKind
entityType
entity
place
categories
paymentProposals
observedAt
relationship
evidenceLinks
```

It does not return:

```text
contact email
protected contact ciphertext
status secret
status token hash
request fingerprint
rate-limit key
remote IP
challenge token
internal Submission UUID
```

The normalized proposal remains private review material.

## 12. Candidate and canonical boundary

P5-02A deliberately does not implement:

```text
Suggest → Candidate auto-create
Suggest → Entity auto-create
Suggest → Location auto-create
Suggest → Claim auto-create
Suggest → public export
```

Later P5-02 slices must add explicit duplicate/existing-target signals and a protected reviewer entry path.

Useful but insufficient suggestions may eventually resolve as:

```text
accepted_as_candidate
```

but this slice only defines and normalizes the proposal data required for that later decision.

## 13. Validation coverage

Focused coverage verifies:

1. physical Place Suggest parsing and normalization;
2. Online Service Suggest parsing and normalization;
3. rejection of canonical target IDs on new-record Suggest;
4. required relationship disclosure;
5. official HTTPS website requirement for Online Service;
6. address-only Place intake;
7. coordinate-only Place intake;
8. rejection when both address and coordinates are absent;
9. rejection of one-sided and out-of-range coordinates;
10. optional category classification with duplicate and multiple-primary rejection;
11. reviewable incomplete payment detail without network inference;
12. empty payment proposal rejection;
13. duplicate payment proposal rejection;
14. zero-primary payment acceptance and multiple-primary rejection;
15. processor requirements for known route types;
16. strict rejection of unexpected type-specific keys;
17. repository schema-check integration.

## 14. Out of scope

P5-02A does not add:

- public `/suggest` route;
- Suggest form UI;
- environment-backed contact encryption;
- production distributed rate limiting;
- Turnstile widget or environment configuration;
- duplicate Candidate search;
- existing-target similarity search;
- reviewer queue/detail UI;
- Candidate creation transaction;
- canonical Entity/Location/Claim mutation;
- Evidence acceptance;
- export or publication.

## 15. Completion criteria

P5-02A is complete when:

1. physical and online Suggest payloads have strict versioned schemas;
2. both compose the P5-01 common envelope;
3. existing canonical targets are rejected by new-record Suggest;
4. relationship disclosure is mandatory;
5. physical location material supports reviewable partial address/coordinate intake;
6. Online Service identity requires an official HTTPS URL;
7. category and payment uncertainty can remain explicit;
8. asset-to-network inference is impossible;
9. known route/processor contradictions are rejected;
10. review-safe normalization excludes common private operational fields;
11. focused tests and schema checks are green;
12. no public route, Candidate mutation, canonical mutation, export, or publication behavior is added.

## Next

After P5-02A merges green, proceed to the next bounded P5-02 slice for private Suggest intake integration and protected review entry preparation.
