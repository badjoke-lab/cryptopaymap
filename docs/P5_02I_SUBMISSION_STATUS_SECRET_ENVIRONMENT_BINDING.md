# P5-02I Submission status-secret environment binding

**Implementation item:** P5-02I  
**Status:** In progress  
**Last updated:** 2026-07-11

## Purpose

P5-02I binds server-only configured key material to the existing deterministic Submission status-secret provider. It does not add a public route or change the P5-01C derivation algorithm.

## Environment contract

The server environment key is:

```text
CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL
```

Its value is canonical unpadded Base64URL using only `A-Z`, `a-z`, `0-9`, `-`, and `_`. It must decode to at least 32 bytes. Missing, empty, malformed, padded, incorrectly encoded, or too-short values fail closed with a bounded configuration error that does not contain the configured value.

The binding accepts an explicit environment record so a later Cloudflare Pages Function can pass `context.env`. It does not read `process.env` implicitly and the key is not a `PUBLIC_*` value.

```text
explicit server environment record
→ strict canonical Base64URL parse
→ decode and minimum-length validation
→ createHmacSubmissionStatusSecretProvider
→ SubmissionStatusSecretProvider
```

The configured value belongs only in an approved runtime secret facility. It must not be committed, logged, placed in public build metadata, or copied into generated artifacts.

## Preserved behavior

P5-02I reuses the P5-01C HMAC provider and therefore preserves:

- the existing HMAC-SHA-256 domain and status-secret encoding;
- same key plus same request UUID producing the same secret;
- different request UUIDs producing different secrets;
- stored token-hash replay-integrity verification;
- no plaintext status-secret persistence.

## Out of scope

P5-02I does not implement contact encryption, email hashing, opaque rate-limit keys, distributed rate limiting, remote-IP extraction, Turnstile changes, CSP, a public API route, or a public form/page. Public Suggest intake remains unavailable. P5-03 remains blocked.

## Completion criteria

P5-02I is complete when the explicit environment binding strictly validates and decodes the server-only key, returns the existing provider interface, preserves deterministic request behavior, fails closed without exposing configured values, and passes focused and full repository validation.

Repository tests do not claim live configured-environment verification.
