# P5-01E Submission foundation Audit and P5-02 handoff

**Implementation item:** P5-01E  
**Status:** Active  
**Last updated:** 2026-07-09

## Purpose

P5-01E closes the shared Submission foundation by auditing P5-01A through P5-01D as one boundary, connecting durable Submission workflow events to protected metadata-only Audit history, and deciding whether type-specific Suggest work may begin.

The audit distinguishes:

- repository-complete shared foundation behavior;
- route/environment work that must be completed when public intake is exposed;
- later type-specific Submission work;
- retained Launch work unrelated to the P5-01 foundation gate.

Repository tests are not described as live Cloudflare, Neon, or distributed rate-limit verification.

## 1. P5-01 closure summary

| Slice | Result | Main capability |
|---|---|---|
| P5-01A | Completed | strict common contract, privacy model, public reference, status-secret and safe status projection boundaries |
| P5-01B | Completed | private durable persistence, workflow events, public-reference allocation, transition guards and migration 0023 |
| P5-01C | Completed | canonical fingerprint, exact replay, changed-content conflict, HMAC status-secret re-derivation and protected contact gate |
| P5-01D | Completed | provider-neutral rate/challenge contracts, fail-closed abuse gate and Turnstile Siteverify adapter |
| P5-01E | Active in this change | metadata-only Submission Audit integration and A-D foundation reconciliation |

## 2. Shared end-to-end foundation path

The repository foundation now composes:

```text
public-route-shaped request inputs
↓
P5-01D abuse request validation
↓
rate-limit decision
↓
challenge verification
↓
P5-01C strict common intake parse
↓
canonical SHA-256 fingerprint
↓
request-ID replay/conflict decision
↓
request-bound status-secret re-derivation
↓
optional contact protection
↓
P5-01B public reference allocation
↓
atomic private persistence
↓
received workflow event
↓
safe private intake receipt
↓
protected metadata-only Audit history
```

A public HTTP route and type-specific Suggest form are intentionally not part of P5-01.

## 3. Privacy audit

P5-01 enforces separate boundaries for:

### Public receipt

Allowed:

```text
state
publicId
statusSecret
submittedAt
```

Not allowed:

```text
internal UUID
intake request UUID
request fingerprint
status token hash
contact email
protected contact ciphertext
email hash
private payload
priority
actor identity
remote IP
rate-limit key
challenge token
```

### Parent Submission persistence

Stores operational identity and workflow metadata, but not plaintext status secret or plaintext email.

### Private payload persistence

Stores safely parsed private Submission payload content separately from parent workflow state and protected contact rows.

### Contact persistence

Accepts only already protected output:

```text
encrypted email
email hash
contact permission
retention deadline
```

A public route must not be exposed until a concrete environment-backed contact-protection implementation exists.

### Audit history

Submission Audit selects only:

```text
event ID
public Submission reference
Submission type
from status
to status
action
reason code
actor ID
actor type
created time
```

The source does not select private payload, contact, token, fingerprint, abuse-control, network-origin, or internal-note fields.

## 4. Idempotency audit

P5-01C provides two independent replay checks:

1. exact canonical fingerprint equality for one intake request UUID;
2. equality between the request-bound re-derived status-secret hash and durable stored token hash.

Result:

```text
same request UUID + same fingerprint + matching token hash
→ replay same public reference and same status secret

same request UUID + different fingerprint
→ idempotency conflict

same request UUID + same fingerprint + token hash mismatch
→ replay integrity failure
```

Concurrent insert conflicts perform one durable request lookup. Matching state becomes replay. Missing matching state preserves the persistence conflict.

## 5. Persistence and workflow audit

P5-01B provides durable tables for:

```text
submission public-reference counters
submissions
submission payloads
submission contacts
submission events
```

Creation persists the private bundle atomically.

Workflow transitions require:

```text
expected status
expected updated timestamp
allowed transition
valid resolution shape
```

A stale reviewer state fails before the status change and workflow-event insert can be accepted as a successful transition.

The migration history contains generated migration `0023` for the Submission persistence foundation.

## 6. Abuse-control audit

P5-01D enforces:

```text
rate-limit decision
before
challenge verification
before
private intake
```

Fail-closed outcomes:

```text
rate-limit deny
→ no challenge verification, no intake

rate-limit unavailable
→ no challenge verification, no intake

challenge deny
→ no intake

challenge unavailable
→ no intake
```

The domain service accepts an opaque rate-limit bucket key rather than a raw IP-shaped identifier.

The Cloudflare adapter remains behind the provider-neutral challenge interface.

## 7. Submission Audit integration

P5-01E adds:

```text
domain: submission
sourceKind: submission_event
targetType: submission
```

The target ID is the opaque public Submission reference:

```text
CPM-S-YYYY-NNNNNN
```

The internal Submission UUID is not used as the protected Audit target identifier.

Actor normalization:

```text
submitter → human
reviewer  → human
system    → system
```

The original bounded actor ID remains available to protected Audit readers.

The standard durable Audit source registry now contains eight sources. Location profile correction remains the separately appended durable source. Restore execution remains excluded from durable Drizzle source registration until a production persistence table exists.

## 8. Private-field exclusion result

P5-01E regression coverage verifies that the Submission Audit Drizzle projection does not select:

```text
internalNote
requestFingerprint
statusTokenHash
encryptedEmail
emailHash
originalPayload
normalizedPayload
proposedChanges
```

The P5-01 foundation integration coverage also verifies that safe intake receipts do not expose:

```text
contact email
protected contact ciphertext
request fingerprint
status token hash
remote IP
rate-limit key
```

## 9. A-D integration audit

The bounded integration audit verifies:

1. one allowed abuse-controlled request commits exactly one private Submission;
2. identical retry returns a replay receipt with the same public reference and status secret;
3. changed content under the same request UUID returns idempotency conflict;
4. rate-limit denial leaves persistence empty;
5. challenge denial leaves persistence empty;
6. the safe receipt excludes private operational fields.

This integration test does not claim live distributed provider or live database verification.

## 10. Repository-complete P5-01 boundary

P5-01 is repository-complete when this P5-01E change is green because the shared foundation then has:

- strict common intake contract;
- bounded JSON payload rules;
- public reference and status-secret separation;
- safe public/private status projection contract;
- private durable Submission persistence;
- original/normalized/proposed payload separation;
- protected contact persistence boundary;
- workflow event history;
- guarded workflow transitions;
- canonical request fingerprinting;
- exact replay and changed-content conflict;
- deterministic request-bound status-secret re-derivation;
- replay integrity checking;
- contact-protection provider gate;
- provider-neutral rate-limit contract;
- provider-neutral challenge-verification contract;
- fail-closed abuse-control ordering;
- Turnstile Siteverify adapter;
- metadata-only durable Submission Audit source;
- cross-slice integration coverage.

## 11. Required route/environment work before public intake exposure

P5-01 repository closure does not mean a public route can be exposed with placeholder providers.

The first public intake route must wire and verify:

1. concrete environment-backed contact encryption and email-hash implementation;
2. Submission status HMAC key binding from secret environment configuration;
3. production distributed rate-limit provider suitable for Cloudflare multi-instance execution;
4. privacy-preserving opaque bucket-key derivation using an environment-backed keyed mechanism;
5. Turnstile secret-key environment binding;
6. Turnstile site key/widget integration for the public form;
7. exact production/review hostname configuration;
8. exact expected action configuration;
9. route-level CSP and script/connect requirements when the widget is introduced;
10. route-level safe error mapping and Retry-After behavior;
11. no logging of challenge token, raw remote IP, plaintext email, plaintext status secret, or provider secret;
12. configured-environment verification of the complete route path.

These requirements belong to the first type-specific public intake route implementation and its configured-environment verification. They must not be replaced by test-only providers.

## 12. Retained Launch work

P5-01 closure does not waive previously retained Launch work, including:

- live Cloudflare Access and Admin identity verification;
- actual allowlist/environment verification;
- live Neon migration-state verification;
- representative protected Admin journeys with configured data;
- canonical query → complete candidate generation → private upload → release-review handoff;
- corrected canonical value → generation → release → activation flow;
- concrete R2 publication conditional-write verification;
- production restore persistence, invocation, R2 adapter wiring, durable restore Audit source, reconciliation runbook, and drills.

## 13. P5-02 gate decision

P5-02 Suggest Place and Online Service may begin after P5-01E merges green because:

1. the common Submission contract is explicit;
2. privacy boundaries are explicit;
3. durable private persistence exists;
4. workflow history exists;
5. idempotent replay/conflict behavior exists;
6. status-secret handling avoids plaintext persistence;
7. contact persistence requires a protection provider;
8. abuse-control ordering is fail closed;
9. Turnstile is isolated behind a provider-neutral adapter;
10. Submission Audit history is metadata-only;
11. cross-slice integration coverage is green;
12. no common foundation blocker requires a type-specific form to be implemented inside P5-01.

P5-02 must not bypass the shared foundation. Its public route and form must compose the P5-01 contracts rather than reimplementing them.

## 14. Out of scope

P5-01E does not implement:

- Suggest Place form;
- Suggest Online Service form;
- public Submission HTTP route;
- production contact encryption provider;
- production distributed rate-limit provider;
- Turnstile widget;
- Submission review UI;
- partial approval;
- canonical application transaction;
- public status lookup route;
- notification delivery;
- Media quarantine upload;
- production restore capability.

## 15. Completion criteria

P5-01E is complete when:

1. Submission is a valid Audit domain;
2. `submission_event` is a valid Audit source kind;
3. Submission target filtering uses opaque public reference;
4. durable Submission source is registered in protected Audit aggregation;
5. source projection excludes private fields before normalization;
6. actor-type normalization is explicit;
7. A-D integration audit is green;
8. Audit contract check is part of `schema:check`;
9. existing durable-source count tests are reconciled;
10. full repository validation is green;
11. P5-02 gate and route/environment obligations are explicitly recorded.

## Next

After P5-01E is green and merged:

```text
P5-02 — Suggest Place and Online Service
```

P5-02 should begin with a type-specific Suggest contract layered on the shared P5-01 envelope, followed by protected private review entry and public route/form wiring with real environment-backed abuse and contact-protection providers.
