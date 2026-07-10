# P5-01D abuse-control and Turnstile boundary

**Implementation item:** P5-01D  
**Status:** Completed through #153
**Last updated:** 2026-07-09

## Purpose

P5-01D gates the P5-01C private intake service behind provider-neutral rate-limit and challenge-verification contracts before any public Submission route is exposed.

The required order is:

```text
request validation
↓
rate-limit decision
↓
challenge verification
↓
P5-01C private intake
```

Neither rate-limit failure nor challenge failure may create a durable Submission.

## 1. Provider-neutral boundaries

P5-01D defines two domain-facing interfaces.

### Rate limiter

Input:

```text
request UUID
opaque rate-limit bucket key
received time
```

Decision:

```text
allow
├─ optional remaining count

deny
├─ retry-after seconds

unavailable
└─ provider-neutral reason code
```

### Challenge verifier

Input:

```text
request UUID
challenge token
ephemeral optional remote IP
```

Decision:

```text
allow
deny
unavailable
```

The domain wrapper does not depend directly on Cloudflare response objects or error-code arrays.

## 2. Abuse-control order

Rate limiting runs before Turnstile validation.

This order prevents an obviously over-limit bucket from causing additional external challenge-validation traffic.

The wrapper fails closed:

```text
rate-limit deny
→ rate_limited

rate-limit unavailable
→ rate_limit_unavailable

challenge deny
→ challenge_rejected

challenge unavailable
→ challenge_unavailable
```

P5-01C intake is invoked only after both controls allow the request.

## 3. Opaque rate-limit key

The domain wrapper accepts only an opaque key with this contract:

```text
rl_<opaque URL-safe value>
```

Raw IP addresses are rejected by the wrapper shape.

A later public route must derive the bucket key before calling the domain service. The derivation must use a privacy-preserving keyed hash or equivalent environment-backed mechanism and must not store or expose the raw address through the Submission persistence model.

P5-01D does not define the production key-derivation secret or durable distributed rate-limit provider.

## 4. In-memory rate limiter

P5-01D includes an in-memory fixed-window implementation for contract checks and bounded local tests.

It supports:

- positive integer limit;
- minimum one-second window;
- per-bucket counting;
- remaining count on allow;
- retry-after seconds on deny;
- reset after the window.

It is not a production multi-instance rate limiter. Production route wiring must use a provider appropriate for distributed Cloudflare execution.

## 5. Turnstile Siteverify adapter

P5-01D adds a Cloudflare Turnstile Siteverify adapter behind the provider-neutral challenge interface.

The adapter:

- validates request UUID and token shape before network access;
- limits the token to 2,048 characters;
- calls the server-side Siteverify endpoint;
- sends the server secret only from backend configuration;
- sends the challenge token as `response`;
- uses the Submission request UUID as `idempotency_key`;
- optionally passes the remote IP ephemerally;
- applies a bounded timeout;
- validates the returned response shape;
- requires exact expected hostname and action on a successful provider response;
- maps provider success/failure into provider-neutral decisions;
- classifies provider internal error, network failure, timeout, non-OK HTTP response, invalid JSON, and malformed response shape as unavailable.

The adapter does not log the secret key, challenge token, or remote IP.

## 6. Exact hostname and action

A provider response with `success: true` is not enough for an allow decision.

The adapter also requires:

```text
hostname === expectedHostname
action === expectedAction
```

Mismatch is denied.

This prevents a token solved for another configured hostname or action from being accepted by the Submission intake boundary.

## 7. Retry relationship with P5-01C

Turnstile tokens are validated through Siteverify before P5-01C intake is called.

The adapter sends:

```text
idempotency_key = submission request UUID
```

The P5-01C service independently uses the same request UUID for durable intake idempotency.

The combined intended retry path is:

```text
same request UUID
+ same challenge validation retry identity
+ same parsed Submission fingerprint
→ safe validation retry and P5-01C replay
```

Changed Submission content under the same request UUID remains a P5-01C idempotency conflict even if abuse controls allow the request.

## 8. Remote IP handling

The challenge-verification request may carry an optional remote IP only for the outbound Siteverify call.

The P5-01D domain and P5-01C persistence contracts do not store it.

The future route must not place raw IP into:

- Submission parent rows;
- Submission payloads;
- Submission contacts;
- workflow events;
- public status receipts;
- public exports.

## 9. Safe error boundary

The public route added by a later item must map P5-01D errors into bounded user-facing responses.

Internal provider details must not be returned to the submitter.

The domain errors are limited to:

```text
abuse_request_invalid
rate_limited
rate_limit_unavailable
challenge_rejected
challenge_unavailable
```

Only the rate-limit error carries an optional retry-after value.

## 10. Out of scope

P5-01D does not implement:

- a public Submission HTTP route;
- public forms;
- production rate-limit storage/provider;
- production opaque bucket-key derivation;
- environment secret wiring;
- Turnstile widget rendering;
- CSP changes for the widget;
- production hostname configuration;
- production contact encryption provider;
- secret-status lookup route;
- type-specific Suggest, Report, Claim, or Photos logic;
- canonical mutation;
- export or publication.

## 11. Completion criteria

P5-01D is complete when:

1. rate limit runs before challenge verification;
2. rate deny prevents challenge verification and intake;
3. rate unavailable fails closed;
4. challenge deny prevents intake;
5. challenge unavailable fails closed;
6. opaque rate-limit key shape rejects raw IP-shaped input;
7. Siteverify token length is bounded before network access;
8. Siteverify request uses the Submission request UUID as idempotency key;
9. success requires exact hostname and action;
10. provider internal/network/response failures normalize to unavailable;
11. remote IP is not persisted by the Submission domain;
12. focused tests, schema checks, and full repository validation are green;
13. no public Submission route or form is introduced.

## Next

After P5-01D is green and merged, proceed to:

```text
P5-01E — Audit integration and Phase 5 foundation audit
```

P5-01E must reconcile P5-01A through P5-01D, add metadata-only Submission Audit integration, verify private-field exclusion, and determine whether P5-02 can begin.
