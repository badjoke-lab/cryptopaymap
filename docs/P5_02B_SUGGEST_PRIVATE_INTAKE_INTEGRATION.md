# P5-02B Suggest private intake integration

**Implementation item:** P5-02B  
**Status:** Completed through #157
**Last updated:** 2026-07-10

## Purpose

P5-02B integrates the P5-02A Suggest contract with the P5-01 private intake foundation.

The key requirement is ordering:

```text
strict Suggest parse
↓
review-safe Suggest normalization
↓
P5-01 fingerprint / idempotency / contact protection
↓
public reference allocation
↓
atomic private persistence
```

An input that passes only the common Submission envelope but fails the type-specific Suggest contract must not be persisted first and rejected later.

## 1. Reusable type-specific parser extension

P5-02B adds a bounded parser extension point to the P5-01 private intake service.

The parser returns:

```text
parsed common-compatible intake
normalized private review payload or null
```

The generic P5-01 path keeps its existing behavior and uses:

```text
common parser
normalizedPayload = null
```

The Suggest path injects:

```text
Suggest strict parser
Suggest review-safe normalizer
```

This extension point is intentionally generic enough for later Report, Claim, and Media intake families without coupling the common intake service to one type-specific schema.

## 2. Validation order

P5-02B validates type-specific Suggest content before:

- fingerprint lookup;
- contact protection;
- public reference allocation;
- durable persistence.

Therefore a malformed Suggest payload cannot create a private Submission merely because it satisfies the common envelope.

Examples rejected before persistence include:

- Online Service suggestion without required official HTTPS URL;
- invalid Place location shape;
- empty payment proposal;
- contradictory known route/processor shape;
- unexpected type-specific keys.

## 3. Fingerprint and replay behavior

The fingerprint remains based on the fully parsed common-compatible intake, including the type-specific original payload.

Result:

```text
same request UUID + same Suggest content
→ replay original receipt

same request UUID + changed Suggest content
→ idempotency conflict
```

The normalized review payload is not used as a separate replay identity. It is deterministically derived from the parsed intake and stored with the original payload.

## 4. Atomic private persistence

The existing `submission_payloads` table already has:

```text
original_payload
normalized_payload
proposed_changes
```

P5-02B does not add a migration.

The private create command now accepts an optional normalized payload and persists it in the same atomic private bundle as:

- Submission parent row;
- original private payload;
- optional protected contact;
- initial workflow event.

For Suggest intake:

```text
original_payload
= safely parsed original Suggest content + Evidence links + acknowledgements

normalized_payload
= review-safe Suggest projection

proposed_changes
= null
```

P5-02B does not write canonical proposed changes yet.

## 5. Review-safe normalized payload

The normalized Suggest payload contains only:

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

It excludes:

- plaintext contact email;
- protected contact ciphertext;
- email hash;
- status secret;
- status token hash;
- request fingerprint;
- rate-limit key;
- remote IP;
- challenge token;
- internal Submission UUID.

The normalized payload remains private reviewer material.

## 6. Abuse-control composition

P5-02B keeps the P5-01D order:

```text
rate-limit decision
↓
challenge verification
↓
Suggest strict parse / normalization
↓
private intake persistence
```

Rate or challenge denial still prevents Suggest parsing and persistence through the shared abuse-controlled wrapper.

After abuse allow, type-specific Suggest validation may still reject the request before durable intake.

## 7. Backward compatibility

The generic P5-01 private intake service remains compatible with existing tests and later non-Suggest callers.

When no type-specific parser is injected:

```text
normalized_payload = null
```

This prevents P5-02B from silently changing generic Submission-family behavior.

## 8. Test coverage

P5-02B verifies:

1. valid Suggest intake stores original and normalized private payloads;
2. normalized payload is review-safe and excludes contact data;
3. invalid type-specific Suggest fails before contact protection;
4. invalid type-specific Suggest leaves persistence empty;
5. identical Suggest retry returns replay and keeps one stored Submission;
6. changed Suggest content under the same request UUID conflicts;
7. abuse-control order remains rate limit → challenge → Suggest intake;
8. abuse-controlled valid Suggest stores normalized payload;
9. generic P5-01 intake remains compatible and stores `normalizedPayload = null`;
10. schema check exercises the specialized Suggest private intake factory.

## 9. Out of scope

P5-02B does not add:

- public `/suggest` route;
- Suggest form UI;
- environment-backed provider wiring;
- duplicate Candidate search;
- existing-target similarity search;
- Candidate creation transaction;
- protected reviewer queue/detail UI;
- canonical mutation;
- Evidence acceptance;
- export or publication.

## 10. Completion criteria

P5-02B is complete when:

1. the common private intake service supports an optional type-specific parser/normalizer;
2. generic callers remain backward compatible;
3. Suggest strict validation occurs before contact protection and durable persistence;
4. valid Suggest normalized payload persists atomically with the private Submission bundle;
5. replay/conflict behavior remains deterministic;
6. normalized payload excludes common private operational fields;
7. abuse-control composition remains intact;
8. focused tests and schema checks are green;
9. full repository validation is green;
10. no public route, Candidate mutation, canonical mutation, export, or publication is introduced.

## Next

After P5-02B merges green, proceed to the next bounded P5-02 slice for duplicate Candidate and existing-target signal generation before reviewer entry.
