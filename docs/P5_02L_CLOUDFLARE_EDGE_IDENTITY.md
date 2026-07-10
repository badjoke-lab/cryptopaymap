# P5-02L trusted Cloudflare edge identity extraction

**Implementation item:** P5-02L  
**Status:** In progress  
**Last updated:** 2026-07-11

## Purpose

P5-02L establishes the narrow Cloudflare Pages request boundary that reads a single trusted edge identity for later privacy-preserving rate-limit bucket derivation.

This slice reads only `CF-Connecting-IP` from the incoming Pages Function `Request`. It does not use `X-Forwarded-For`, `X-Real-IP`, or another client-controlled fallback.

## Platform contract

Cloudflare documents `CF-Connecting-IP` as the client IP address connecting to Cloudflare and recommends it over `X-Forwarded-For` when an application requires the original visitor IP in a consistent single-value format.

Pages Functions provide the incoming `Request` as `context.request`. A later public route may therefore compose:

```text
context.request
→ read CF-Connecting-IP
→ strict IPv4 / IPv6 validation and normalization
→ ephemeral trusted edge identity
→ P5-02K opaque bucket derivation
```

## Validation and normalization

P5-02L accepts:

- canonical dotted-decimal IPv4;
- valid unbracketed IPv6, normalized to the URL parser canonical lowercase form.

It rejects:

- missing or empty header values;
- comma-separated lists;
- invalid IPv4 ranges;
- non-canonical dotted IPv4 with leading-zero octets;
- bracketed IPv6;
- IPv6 zone identifiers;
- arbitrary non-IP text;
- values longer than the bounded edge-identity input contract.

## Security and privacy invariants

P5-02L preserves these boundaries:

- only `CF-Connecting-IP` is accepted as the trusted edge identity source;
- no fallback to `X-Forwarded-For` or `X-Real-IP` exists;
- the raw edge identity is returned only for immediate P5-02K derivation and is not persisted by this boundary;
- errors are bounded and do not echo header content;
- no logging is introduced;
- no public route is exposed;
- repository checks do not claim live Cloudflare header verification.

## Platform caveat

Cloudflare documents different `CF-Connecting-IP` behavior for Worker subrequests. P5-02L is scoped to the direct incoming Pages Function request boundary. Any later architecture that inserts Worker subrequests or stacked CDN behavior before the public route must re-audit this trust boundary rather than assuming identical semantics.

## Out of scope

P5-02L does not implement opaque bucket HMAC derivation, distributed rate limiting, rate-limit persistence, Turnstile changes, HTTP error mapping, Retry-After behavior, a public API route, a public form/page, CSP, canonical mutation, export, or publication.

Public Suggest intake remains unavailable. P5-03 remains blocked.

## Completion criteria

P5-02L is complete when:

1. the extraction boundary accepts a Pages-compatible incoming `Request`;
2. only `CF-Connecting-IP` is read as the identity source;
3. valid IPv4 and IPv6 inputs are accepted and normalized;
4. missing, multi-value, malformed, or unsupported identity forms fail closed;
5. alternate forwarded headers are ignored as identity sources;
6. errors do not echo raw header content;
7. focused tests, runtime checks, and full GitHub CI pass;
8. no public route, distributed provider, or persistence behavior is introduced.
