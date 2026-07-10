# P5-02J Submission contact protection

**Implementation item:** P5-02J  
**Status:** In progress  
**Last updated:** 2026-07-11

## Purpose

P5-02J implements the production-capable `SubmissionContactProtector` required by the existing private intake service. It protects optional contact email before persistence without adding a public route or changing Suggest intake semantics.

## Environment contract

The server-only environment inputs are:

```text
CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL
CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_ID
CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL
CPM_SUBMISSION_CONTACT_RETENTION_DAYS
```

The encryption key is exactly 32 bytes encoded as canonical unpadded Base64URL and is imported as AES-GCM key material. The email-hash HMAC key is separate purpose-specific key material of at least 32 bytes. The provider rejects equal encryption and hash key material.

The key ID is a bounded non-secret version identifier embedded in the encrypted envelope. Retention is configured as a whole number of days from 1 through 3650. The exact deployed period remains an operational/privacy choice that must be disclosed before public submission launch.

All binding uses an explicit environment record so a later Cloudflare Pages Function can supply `context.env`. No provider secret is read from a `PUBLIC_*` variable.

## Contact protection behavior

Validated email contact is transformed as follows:

```text
validated email
├─ original validated address
│  → AES-256-GCM with random 96-bit IV and version/key-id AAD
│  → v1.<key-id>.<iv-base64url>.<ciphertext-base64url>
└─ NFC + lowercase normalized identity
   → HMAC-SHA-256 with separate hash key and domain separation
   → 64-character lowercase hexadecimal email_hash
```

The encrypted address is randomized between calls while the keyed normalized email hash is deterministic for duplicate/abuse comparison. Plaintext email is never returned from the provider output.

`retention_until` is derived from the validated `receivedAt` timestamp plus the configured retention days.

## Security and privacy invariants

P5-02J preserves these boundaries:

- plaintext email is accepted only at the contact-protection boundary;
- persistence receives only `encryptedEmail`, `emailHash`, `retentionUntil`, and the existing contact permission state;
- encryption and email-hash keys are separate by purpose;
- ciphertext uses a fresh random IV for every protection operation;
- configuration and operation errors are bounded and do not contain email or secret material;
- no contact or provider secret is logged;
- public receipts and public status projections remain unchanged;
- repository checks do not claim live configured-environment verification.

## Out of scope

P5-02J does not implement contact decryption workflows, email delivery, status-secret changes, opaque rate-limit keys, distributed rate limiting, remote-IP extraction, Turnstile changes, CSP, a public API route, a public Suggest form/page, canonical mutation, export, or publication.

Public Suggest intake remains unavailable. P5-03 remains blocked.

## Completion criteria

P5-02J is complete when:

1. explicit server environment input creates the existing `SubmissionContactProtector` interface;
2. AES-GCM encryption uses exactly 32-byte configured key material and a fresh 96-bit IV;
3. ciphertext carries a bounded version and key identifier;
4. normalized email hash uses a separately keyed, domain-separated HMAC-SHA-256;
5. same normalized identity produces the same email hash while repeated encryption remains non-deterministic;
6. retention date is derived from configured whole-day policy;
7. missing, malformed, non-canonical, incorrectly sized, same-purpose key material, invalid key IDs, and invalid retention fail closed;
8. operation errors expose neither plaintext email nor configured secret values;
9. focused tests, runtime checks, and full GitHub CI pass;
10. no public route or form is introduced.
