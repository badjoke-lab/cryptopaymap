# P5-03B Report private intake integration

**Implementation item:** P5-03B  
**Status:** Active  
**Last updated:** 2026-07-13

## Purpose

P5-03B connects the strict P5-03A `payment_report` and `problem_report` contracts to the completed P5-01 private Submission intake service.

The slice proves that both report families receive the same private-persistence, deterministic replay, contact protection, public-reference, status-secret, and abuse-control guarantees already used by Suggest, without duplicating or weakening the P5-01 foundation.

P5-03B does not add a public HTTP route, form, target lookup, reviewer queue, Evidence acceptance, Claim-state change, recheck-priority mutation, urgent visibility change, canonical mutation, export, or publication.

## 1. Specialized parser composition

```text
raw payment_report or problem_report
↓
P5-03A strict report-family parser
↓
P5-01 common-envelope parser
↓
P5-03A review-safe normalization
↓
P5-01 private intake service
```

The specialized service supplies only an `intakeParser` to `createSubmissionPrivateIntakeService`.

It reuses the generic foundation for:

- request UUID validation;
- received-time validation;
- canonical request fingerprinting;
- deterministic status-secret issuance;
- replay and changed-content conflict handling;
- contact protection;
- public reference allocation;
- atomic Submission, payload, contact, and event persistence;
- generic persistence conflict recovery.

## 2. Private original payload

The private original payload retains:

```text
originalPayload
evidenceLinks
acknowledgements
```

For payment reports, this may include the optional private transaction URL.

For problem reports, this may include the optional private evidence URL.

These values remain inside the private Submission payload boundary. They do not enter the review-safe normalized payload.

Contact email is never embedded in either payload. It is protected and persisted through the separate Submission contact boundary.

## 3. Review-safe normalized payload

Payment reports persist the P5-03A payment projection, including:

```text
reportKind = payment_report
targetType
targetId
result
paymentDate
payment details
notes
public evidence links
private-transaction-URL presence boolean
```

Problem reports persist the P5-03A problem projection, including:

```text
reportKind = problem_report
targetType
targetId
reportType
observedAt
explanation
structured proposed correction
duplicate target
public evidence links
private-evidence-URL presence boolean
```

The normalized payload excludes:

```text
contact email
encrypted contact value
private transaction URL
private evidence URL
status secret
status-token hash
request fingerprint
rate-limit key
remote IP
challenge token
internal Submission UUID
```

## 4. Idempotency

The generic P5-01 fingerprint covers the validated common envelope, including the complete type-specific original payload.

Therefore:

```text
same request UUID + identical report
→ deterministic replay
→ same public reference
→ same status secret
→ no second private row
```

```text
same request UUID + changed report content
→ idempotency conflict
→ no second private row
```

Payment and problem reports use independent request UUIDs and may coexist as separate private Submission records.

## 5. Validation-before-protection boundary

Type-specific parsing runs before contact protection and persistence.

An invalid report therefore:

- does not invoke the contact protector;
- does not allocate a public reference;
- does not write a Submission, payload, contact, or event row;
- returns the generic private-intake invalid-request failure to later callers.

## 6. Abuse-control composition

The report service can be wrapped by the existing P5-01 abuse-controlled intake service.

The enforced order remains:

```text
rate limit
→ challenge verification
→ report parser
→ private persistence
```

P5-03B does not introduce a new limiter, challenge verifier, edge-identity rule, or bypass.

## 7. Canonical and public non-effects

Committing a report creates only a private Submission in `received` state.

It does not create or mutate:

- canonical Entity, Location, Claim, Asset, Network, Processor, Category, or Media rows;
- accepted Evidence;
- Claim lifecycle state;
- reconfirmation state;
- recheck priority;
- temporary or permanent visibility;
- Candidate state;
- export release state;
- public artifacts.

Later protected P5-03 slices must make those decisions explicitly and auditably.

## 8. Validation coverage

Focused coverage verifies:

1. payment-report original and normalized payload persistence;
2. problem-report structured correction persistence;
3. contact protection and payload separation;
4. invalid report rejection before contact protection or persistence;
5. identical payment-report replay;
6. identical problem-report replay;
7. changed-content conflict under the same request UUID;
8. independent payment/problem request UUID handling;
9. abuse-control ordering before private intake;
10. absence of canonical, Evidence, Claim-state, priority, visibility, and publication effects.

`schema:check` includes a bounded private-intake fixture in addition to the focused Vitest integration suite.

## 9. Completion boundary

P5-03B is complete when:

- the specialized report private-intake service is merged;
- both report families persist private original and review-safe normalized payloads;
- replay and conflict behavior is proved;
- contact and restricted-evidence separation is proved;
- abuse-control composition is proved;
- focused tests and schema checks pass;
- no public route, form, target lookup, protected decision, canonical mutation, export, or publication behavior is added.

## Next

Proceed to P5-03C for canonical target existence, public target snapshot, and Claim-context signal collection. That slice must remain read-only with respect to canonical targets and must not infer a Claim status change from report intake.
