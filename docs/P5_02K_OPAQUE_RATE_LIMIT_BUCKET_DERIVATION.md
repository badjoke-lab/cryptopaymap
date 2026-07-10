# P5-02K opaque Submission rate-limit bucket derivation

**Implementation item:** P5-02K  
**Status:** In progress  
**Last updated:** 2026-07-11

## Purpose

P5-02K derives privacy-preserving opaque rate-limit bucket keys from a bounded trusted edge identity input. It supplies the existing abuse-control contract with `rl_<opaque>` values without storing or exposing the raw identity.

This slice does not extract remote IP addresses and does not choose or implement the distributed rate-limit provider.

## Environment contract

The server-only key is:

```text
CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL
```

The value is canonical unpadded Base64URL and must decode to at least 32 bytes. Missing, empty, malformed, padded, non-canonical, or too-short values fail closed with a bounded configuration error that does not contain configured material.

The binding accepts an explicit environment record so later Cloudflare Pages composition can supply `context.env`. The key is not a `PUBLIC_*` value.

## Derivation contract

```text
bounded trusted edge identity
→ HMAC-SHA-256 with server-only purpose-specific key
→ domain-separated signature
→ canonical Base64URL
→ rl_<opaque>
```

The HMAC domain is versioned and specific to Submission rate-limit bucket derivation. The output is deterministic for the same key and edge identity, differs for different identities or keys, and matches the existing abuse-control request contract.

The raw edge identity is not returned by the derivation boundary and is not embedded in the bucket output.

## Security and privacy invariants

P5-02K preserves these boundaries:

- raw edge identity is accepted only as ephemeral derivation input;
- derived bucket values are opaque keyed outputs;
- the derivation key remains server-only and is never logged;
- configuration and derivation errors contain neither raw identity nor configured secret values;
- output matches the existing `rl_[A-Za-z0-9_-]` abuse-control shape;
- no in-memory or distributed rate limiter is selected or composed;
- repository checks do not claim trusted-header extraction or live configured-environment verification.

## Out of scope

P5-02K does not implement trusted Cloudflare remote-IP extraction, forwarded-header trust policy, distributed rate limiting, rate-limit persistence, Turnstile changes, HTTP error mapping, Retry-After headers, a public API route, a public form/page, CSP, canonical mutation, export, or publication.

Public Suggest intake remains unavailable. P5-03 remains blocked.

## Completion criteria

P5-02K is complete when:

1. explicit server environment input creates a bounded rate-limit bucket deriver;
2. key parsing is strict, canonical, and fail-closed;
3. key material decodes to at least 32 bytes;
4. identical key and identity input produce identical bucket keys;
5. different identities and different configured keys produce different bucket keys;
6. output matches the existing `rl_<opaque>` contract;
7. output does not contain the raw input identity;
8. invalid identity input fails with a bounded derivation error;
9. focused tests, runtime checks, and full GitHub CI pass;
10. no public route or rate-limit provider is introduced.
