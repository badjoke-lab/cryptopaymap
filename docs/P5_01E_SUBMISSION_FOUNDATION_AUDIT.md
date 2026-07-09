# P5-01E Submission foundation Audit and corrected P5-02 handoff

**Implementation item:** P5-01E  
**Status:** Completed through #154; handoff-gate correction tracked by P5-01F  
**Last updated:** 2026-07-09

## Correction note

P5-01E correctly completed Submission Audit integration and the P5-01A–D cross-slice foundation audit. After #154 merged, a direct re-read of `docs/PHASE5_IMPLEMENTATION_SEQUENCE.md` found one completion-gate requirement that the repository had not yet implemented: a synthetic Submission must be retrievable through its private follow-up status boundary.

The repository already had status-secret issuance and verification helpers, durable token-hash persistence, and a strict safe status projection schema, but it did not yet have a `public reference + status secret` read service.

Therefore the original P5-01E statement that P5-02 could begin immediately after #154 was premature. P5-01F closes that requirement before P5-02 begins.

This correction does not reopen the completed P5-01E Audit work. It corrects the P5-01 completion gate transparently.

## Purpose

P5-01E audited P5-01A through P5-01D as one boundary and connected durable Submission workflow events to protected metadata-only Audit history.

The audit distinguishes:

- repository-complete shared foundation behavior;
- route/environment work required when public intake is exposed;
- later type-specific Submission work;
- retained Launch work unrelated to the P5-01 foundation gate.

Repository tests are not described as live Cloudflare, Neon, or distributed rate-limit verification.

## 1. P5-01 slice status after correction

| Slice | Result | Main capability |
|---|---|---|
| P5-01A | Completed | strict common contract, privacy model, public reference, status-secret and safe status projection boundaries |
| P5-01B | Completed | private durable persistence, workflow events, public-reference allocation, transition guards and migration 0023 |
| P5-01C | Completed | canonical fingerprint, exact replay, changed-content conflict, HMAC status-secret re-derivation and protected contact gate |
| P5-01D | Completed | provider-neutral rate/challenge contracts, fail-closed abuse gate and Turnstile Siteverify adapter |
| P5-01E | Completed through #154 | metadata-only Submission Audit integration and A-D foundation reconciliation |
| P5-01F | Required closure correction | private follow-up status read through public reference plus status secret |

## 2. Shared intake foundation path audited by P5-01E

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

A public HTTP route and type-specific Suggest form remain outside P5-01.

P5-01F extends the closure path with:

```text
public reference + status secret
↓
minimal private status lookup
↓
secret verification
↓
strict safe status projection
```

## 3. Privacy audit result

### Safe intake receipt

Allowed:

```text
state
publicId
statusSecret
submittedAt
```

Excluded:

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

Stores safely parsed private Submission payload content separately from workflow state and protected contact rows.

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

## 4. Idempotency audit result

P5-01C provides two independent replay checks:

1. exact canonical fingerprint equality for one intake request UUID;
2. equality between the request-bound re-derived status-secret hash and durable stored token hash.

```text
same request UUID + same fingerprint + matching token hash
→ replay same public reference and same status secret

same request UUID + different fingerprint
→ idempotency conflict

same request UUID + same fingerprint + token hash mismatch
→ replay integrity failure
```

Concurrent insert conflicts perform one durable request lookup. Matching state becomes replay. Missing matching state preserves the persistence conflict.

## 5. Persistence and workflow audit result

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

A stale reviewer state fails before the status change and workflow-event insert can be accepted as successful.

Migration history contains generated migration `0023` for the Submission persistence foundation.

## 6. Abuse-control audit result

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

The domain accepts an opaque rate-limit bucket key rather than a raw IP-shaped identifier. The Cloudflare adapter remains behind the provider-neutral challenge interface.

## 7. Submission Audit integration result

P5-01E added:

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

The standard durable Audit source registry contains eight sources. Location profile correction remains the separately appended durable source. Restore execution remains excluded from durable Drizzle source registration until a production persistence table exists.

## 8. Private-field exclusion result

Regression coverage verifies that the Submission Audit Drizzle projection does not select:

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

The foundation integration coverage also verifies that safe intake receipts do not expose:

```text
contact email
protected contact ciphertext
request fingerprint
status token hash
remote IP
rate-limit key
```

## 9. A-D integration audit result

The bounded integration audit verifies:

1. one allowed abuse-controlled request commits exactly one private Submission;
2. identical retry returns a replay receipt with the same public reference and status secret;
3. changed content under the same request UUID returns idempotency conflict;
4. rate-limit denial leaves persistence empty;
5. challenge denial leaves persistence empty;
6. the safe receipt excludes private operational fields.

This does not claim live distributed provider or live database verification.

## 10. Required route/environment work before public intake exposure

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

These requirements must not be replaced by test-only providers.

## 11. Retained Launch work

P5-01 closure does not waive previously retained Launch work, including:

- live Cloudflare Access and Admin identity verification;
- actual allowlist/environment verification;
- live Neon migration-state verification;
- representative protected Admin journeys with configured data;
- canonical query → complete candidate generation → private upload → release-review handoff;
- corrected canonical value → generation → release → activation flow;
- concrete R2 publication conditional-write verification;
- production restore persistence, invocation, R2 adapter wiring, durable restore Audit source, reconciliation runbook, and drills.

## 12. Corrected P5-02 gate decision

P5-02 must wait until P5-01F merges green.

After P5-01F completes, the P5-02 gate is satisfied because:

1. the common Submission contract is explicit;
2. privacy boundaries are explicit;
3. durable private persistence exists;
4. workflow history exists;
5. idempotent replay/conflict behavior exists;
6. status-secret handling avoids plaintext persistence;
7. private follow-up status can be retrieved through public reference plus valid secret;
8. missing reference and wrong secret share one bounded service failure;
9. contact persistence requires a protection provider;
10. abuse-control ordering is fail closed;
11. Turnstile is isolated behind a provider-neutral adapter;
12. Submission Audit history is metadata-only;
13. cross-slice integration coverage is green.

P5-02 must compose the P5-01 contracts rather than reimplementing them.

## 13. P5-01E completion result

P5-01E remains completed through #154 for its own scope:

1. Submission is a valid Audit domain;
2. `submission_event` is a valid Audit source kind;
3. Submission target filtering uses opaque public reference;
4. durable Submission source is registered in protected Audit aggregation;
5. source projection excludes private fields before normalization;
6. actor-type normalization is explicit;
7. A-D integration audit is green;
8. Audit contract check is part of `schema:check`;
9. durable-source count tests are reconciled;
10. full repository validation was green.

The only corrected statement is the broader P5-01/P5-02 handoff gate.

## Next

Complete:

```text
P5-01F — Private follow-up status read boundary
```

Then proceed to:

```text
P5-02 — Suggest Place and Online Service
```
