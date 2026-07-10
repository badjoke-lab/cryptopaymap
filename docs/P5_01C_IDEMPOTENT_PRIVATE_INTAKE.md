# P5-01C idempotent private intake service

**Implementation item:** P5-01C  
**Status:** Completed through #152
**Last updated:** 2026-07-09

## Purpose

P5-01C combines the P5-01A submission contract and status-secret boundary with the P5-01B persistence foundation to create a deterministic, private, idempotent intake service before any public route is exposed.

The service provides:

- strict common intake parsing;
- canonical request fingerprinting;
- exact replay for identical retries;
- changed-content conflict for reused request identity;
- deterministic status-secret re-derivation without plaintext secret storage;
- mandatory contact-protection provider injection;
- safe private intake receipts;
- race-conflict recovery;
- fail-closed replay integrity checks.

## 1. Intake order

The intake service executes:

```text
request UUID validation
↓
strict common intake parsing
↓
canonical SHA-256 fingerprint
↓
read by intake request UUID
├─ existing + same fingerprint → replay path
├─ existing + changed fingerprint → conflict
└─ absent → new intake path
↓
deterministic status secret issuance
↓
optional contact protection
↓
public reference allocation
↓
private atomic persistence
↓
safe receipt
```

No Candidate, canonical, Evidence, Media review, export, or public artifact mutation occurs.

## 2. Request fingerprint

The request fingerprint is SHA-256 over a canonical JSON representation of the parsed common intake.

Canonicalization rules:

- object keys are sorted recursively;
- array order is preserved;
- values are fingerprinted after strict P5-01A parsing;
- the complete parsed common intake participates, including private contact input, evidence links, acknowledgements, target identity, relationship, and original payload.

This means equivalent object-key ordering produces the same fingerprint while any meaningful parsed content change produces a different fingerprint.

The stored fingerprint is lowercase 64-character SHA-256 hexadecimal text.

## 3. Replay semantics

For one `intake_request_id`:

```text
same request ID + same fingerprint
→ replay existing public reference and deterministic status secret

same request ID + different fingerprint
→ idempotency_conflict
```

A replay does not allocate another public reference, persist another Submission, or invoke contact protection again.

The receipt state distinguishes:

```text
committed
replayed
```

but both receipts return the same:

- public reference;
- status secret;
- original submitted timestamp.

The receipt does not expose internal UUID, request fingerprint, status token hash, contact data, private payload, priority, actor identity, or reviewer state.

## 4. Deterministic status secret

P5-01C introduces a `SubmissionStatusSecretProvider` boundary.

The HMAC provider derives entropy as:

```text
HMAC-SHA-256(
  server secret key,
  "cryptopaymap:submission-status:v1:" + request UUID
)
```

The 32-byte result is supplied to the existing P5-01A status-secret issuer.

Properties:

- the same request UUID and server key re-derive the same secret;
- different request UUIDs derive different secrets;
- the plaintext secret is not stored in the Submission row;
- the persistence layer stores only the existing SHA-256 status-token hash representation;
- the HMAC key must be at least 32 bytes;
- the HMAC key is an environment secret and must never be committed or logged.

P5-01C defines the provider and deterministic contract. Environment binding belongs to the later route/configured-environment work.

## 5. Replay integrity check

Exact request fingerprint equality is not sufficient by itself.

On replay, the service also re-derives the deterministic secret and verifies that its token hash exactly matches the durable `status_token_hash` stored for that request.

Mismatch produces:

```text
replay_integrity_failure
```

The service fails closed rather than returning a secret that does not correspond to durable private state.

## 6. Contact protection boundary

The intake service receives plaintext email only from the already parsed private intake object.

When contact exists, persistence is blocked until an injected `SubmissionContactProtector` returns:

```text
encrypted_email
email_hash
retention_until
```

The service adds the submitter-provided `contact_allowed` value and passes only protected contact persistence input to P5-01B.

P5-01C does not implement a production encryption provider. Public routing must not be exposed until a concrete environment-backed provider is wired and verified.

Contact-protection failure returns:

```text
contact_protection_failed
```

and no Submission row is accepted.

## 7. Private payload persistence

P5-01C persists a private payload object containing:

```text
originalPayload
evidenceLinks
acknowledgements
```

The nested `originalPayload` remains structurally unchanged after P5-01A parsing.

Contact is deliberately excluded from this JSON payload and persists only through the protected contact boundary.

Type-specific normalization and proposed canonical changes remain later review responsibilities.

## 8. Concurrent create race

The service first performs a request-ID lookup. Another worker may commit the same request between that lookup and creation.

If atomic persistence returns a conflict, P5-01C performs one follow-up lookup:

```text
matching durable request + same fingerprint + matching secret hash
→ replay

matching durable request + changed fingerprint
→ idempotency_conflict

no matching durable request
→ preserve original persistence conflict
```

Public reference allocation gaps are acceptable under a race. Allocated references are never reused or wrapped merely to eliminate gaps.

## 9. Failure atomicity

P5-01C preserves the P5-01B atomic persistence bundle.

Before persistence:

- invalid request fails before contact protection or allocation;
- changed-content replay conflict fails before contact protection or allocation;
- contact-protection failure fails before public reference allocation and durable creation.

At persistence:

- parent Submission;
- private payload;
- optional protected contact;
- initial workflow event

remain one P5-01B atomic database batch.

## 10. Out of scope

P5-01C does not implement:

- public Submission route;
- public form UI;
- Cloudflare Turnstile;
- rate limiting;
- production contact encryption provider;
- HMAC environment binding;
- secret-status lookup route;
- status-session cookie;
- additional-information response route;
- type-specific Suggest, Report, Claim, or Photos logic;
- canonical mutation;
- public export or publication.

## 11. Completion criteria

P5-01C is complete when:

1. parsed intake content has a stable canonical SHA-256 fingerprint;
2. object-key ordering does not alter the fingerprint;
3. identical retry returns the same public reference and status secret;
4. changed content under the same request UUID fails conflict;
5. replay does not create a second durable Submission;
6. status secret is deterministically re-derived without plaintext persistence;
7. replay fails closed if durable token hash and re-derived secret disagree;
8. contact-bearing intake requires protected contact output before persistence;
9. contact protection failure leaves no accepted durable Submission;
10. concurrent matching insert conflict can recover as replay;
11. private receipt exposes no internal/private fields;
12. focused tests, schema checks, and full repository validation are green;
13. no public route or individual submission form is introduced.

## Next

After P5-01C is green and merged, proceed to:

```text
P5-01D — abuse-control and Turnstile boundary
```

P5-01D must gate durable intake behind provider-neutral abuse verification and bounded rate-limit decisions without coupling the domain service directly to Cloudflare response objects.
