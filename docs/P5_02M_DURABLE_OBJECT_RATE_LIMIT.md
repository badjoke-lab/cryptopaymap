# P5-02M Durable Object distributed Submission rate limiting

**Implementation item:** P5-02M  
**Status:** In progress  
**Last updated:** 2026-07-11

## Purpose

P5-02M implements the production distributed `SubmissionRateLimiter` behind the existing P5-01D provider-neutral interface using a SQLite-backed Cloudflare Durable Object.

This slice does not expose the public Suggest route. It adds the distributed provider, worker deployment configuration, provider-neutral adapter, fixed-window state transition contract, focused tests, and a worker dry-run compilation gate.

## Why Durable Objects

CryptoPayMap requires free-tier-compatible distributed abuse control before public Suggest exposure.

Cloudflare documents SQLite-backed Durable Objects as available on the Workers Free plan. Durable Objects provide globally addressed stateful compute with strongly consistent attached storage. Pages Functions can bind to a Durable Object namespace and call a stub through `context.env` after deployment configuration.

The architecture is:

```text
P5-02L trusted edge identity
→ P5-02K opaque rl_<bucket> derivation
→ SubmissionRateLimiter adapter
→ Durable Object namespace idFromName(opaque bucket)
→ one SQLite-backed Durable Object per opaque bucket
→ fixed-window state
→ allow / deny + Retry-After seconds / unavailable
```

Raw IP addresses never enter the distributed provider. The Durable Object identity is the already opaque P5-02K bucket key.

## Worker and binding contract

Worker source:

```text
workers/submission-rate-limit/index.ts
```

Wrangler configuration:

```text
workers/submission-rate-limit/wrangler.jsonc
```

Worker name:

```text
cryptopaymap-submission-rate-limit
```

Durable Object class:

```text
SubmissionRateLimitBucket
```

Namespace binding name:

```text
SUBMISSION_RATE_LIMIT_BUCKETS
```

The worker configuration creates the class with `new_sqlite_classes` migration tag `v1`, which is the Cloudflare-required migration form for a new SQLite-backed Durable Object class.

A later configured Pages environment must bind the Pages Function environment to the Durable Object namespace before route activation. Repository tests and dry-run compilation do not claim that this live binding exists.

## Fixed-window behavior

Each opaque bucket maps deterministically to one Durable Object identity.

The object stores one fixed-window state:

```text
window_started_at_ms
request_count
```

The contract:

- first request starts the window and is allowed;
- allowed requests increment the count until the configured limit is reached;
- further requests are denied without incrementing the count;
- deny decisions return a positive whole-second `retryAfterSeconds` value;
- expiry of the configured window starts a fresh window;
- invalid or stale persisted state starts a fresh bounded window rather than exposing internal provider state.

Limit and window configuration are bounded before the provider is created:

- `limit`: 1 through 10,000;
- `windowMs`: 1,000 through 86,400,000.

The public route policy values are intentionally not chosen by this slice. A later composition slice must bind a documented operational policy.

## Pages-side adapter behavior

`createDurableObjectSubmissionRateLimiter` implements the existing `SubmissionRateLimiter` interface.

It:

- validates request UUID, opaque bucket-key shape, and timestamp shape before provider access;
- uses the opaque bucket key as the Durable Object name;
- sends only the bounded limiter options to the object;
- accepts only strict allow or deny provider responses;
- maps HTTP failure, malformed provider response, and provider exceptions to provider-neutral `unavailable`;
- does not expose Durable Object response detail through the domain interface.

## Security and privacy invariants

P5-02M preserves these boundaries:

- the provider receives opaque bucket keys, never raw remote IP addresses;
- one Durable Object identity coordinates one opaque bucket globally;
- state storage is strongly consistent and survives object eviction or restart;
- provider failures fail closed as `unavailable`;
- internal provider errors are not returned through the provider-neutral interface;
- no public route is exposed;
- no Turnstile order changes are made;
- repository checks do not claim deployed Worker or live Pages binding verification.

## Free-tier operating boundary

Cloudflare documents Durable Objects as available on Workers Free when using the SQLite storage backend. The free plan has finite daily request, duration, row-read, row-write, and storage limits.

Public Suggest exposure must therefore retain operational observation of rate-limit traffic and fail closed if the binding/provider is unavailable. P5-02M does not claim unlimited capacity.

## Out of scope

P5-02M does not implement:

- public Suggest route composition;
- Pages deployment binding configuration in a live environment;
- final rate-limit policy values;
- Turnstile environment/browser wiring;
- route-level safe error mapping;
- HTTP `Retry-After` header emission;
- Suggest form/page UI;
- CSP changes;
- configured-environment end-to-end verification;
- canonical mutation, export, or publication;
- P5-03 work.

Public Suggest intake remains unavailable. P5-03 remains blocked.

## Completion criteria

P5-02M is complete when:

1. a SQLite-backed Durable Object worker exists with explicit migration configuration;
2. the Pages-side adapter implements the existing `SubmissionRateLimiter` interface;
3. opaque bucket keys select Durable Object identities;
4. fixed-window allow, remaining-count, deny, retry-after, and expiry behavior are deterministic and tested;
5. provider HTTP failures, malformed responses, and exceptions fail closed as `unavailable`;
6. raw IP identity is absent from the provider contract;
7. runtime checks cover the fixed-window and adapter contracts;
8. Wrangler dry-run compilation is part of the repository quality gate;
9. focused tests and full GitHub CI pass;
10. no public route or form is introduced.
