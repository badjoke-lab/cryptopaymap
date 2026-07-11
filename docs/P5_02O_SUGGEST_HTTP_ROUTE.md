# P5-02O public Suggest HTTP route

**Implementation item:** P5-02O  
**Status:** In progress  
**Last updated:** 2026-07-11

## Purpose

P5-02O composes the completed P5-01 and P5-02 provider foundations into one bounded public Suggest HTTP route.

The route accepts only typed Suggest intake, derives a privacy-preserving rate-limit identity from the trusted Cloudflare edge identity, applies distributed rate limiting before Turnstile verification, persists only through the existing private Suggest intake service, and maps all failures to a bounded public HTTP vocabulary.

This slice adds no Suggest form UI, Turnstile widget rendering, CSP change, canonical mutation, export, or publication behavior.

## Route

```text
POST /api/suggest
```

The Cloudflare Pages Function entry point is:

```text
functions/api/suggest.ts
```

The route is not linked from a public Suggest form in this slice. An unconfigured environment fails closed with a generic unavailable response.

## Request contract

Required headers:

```text
Content-Type: application/json
Idempotency-Key: <UUID>
```

The `Idempotency-Key` UUID is passed through the existing abuse-control and private-intake contracts so one request identity is reused for Turnstile Siteverify idempotency and durable Submission replay protection.

The JSON body is strict:

```json
{
  "challengeToken": "<Turnstile response token>",
  "submission": {
    "...": "strict suggest-v1 intake envelope"
  }
}
```

Unknown top-level HTTP envelope fields are rejected.

The `submission` field is validated with the existing `suggestSubmissionIntakeSchema`; the HTTP route does not invent a second Suggest domain schema.

## Body limit

The route enforces a maximum request body size of:

```text
128 KiB
```

The route checks both:

- an over-limit numeric `Content-Length` header when present;
- the actual streamed request-body byte count.

The stream is cancelled and the request receives `413` when the actual byte limit is exceeded.

This route limit is intentionally larger than the P5-01A 64 KiB `originalPayload` limit because the complete HTTP envelope also contains common Submission metadata, evidence links, acknowledgements, and the Turnstile token.

## Composition order

The route composes the existing contracts in this order:

```text
HTTP media type / UUID / body byte limit
↓
strict HTTP envelope + Suggest schema validation
↓
trusted CF-Connecting-IP extraction
↓
keyed opaque rl_<bucket> derivation
↓
Durable Object distributed rate-limit decision
↓
Turnstile Siteverify with exact hostname and action
↓
Suggest private intake
↓
private persistence + public reference + status secret receipt
```

The P5-01D order remains unchanged:

```text
rate limit
→ challenge verification
→ private intake
```

## Environment composition

The route environment composition requires:

- `DATABASE_URL`;
- Submission status-secret HMAC configuration;
- Submission contact encryption and email-HMAC configuration;
- Submission contact retention configuration;
- opaque rate-limit bucket HMAC configuration;
- Durable Object namespace binding `SUBMISSION_RATE_LIMIT_BUCKETS`;
- rate-limit maximum-request and window configuration;
- Turnstile secret key;
- public Turnstile site key;
- exact expected Turnstile hostname;
- exact expected Turnstile action.

P5-02O adds two server-side rate policy values:

```text
CPM_SUBMISSION_RATE_LIMIT_MAX_REQUESTS
CPM_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS
```

Allowed configuration ranges are:

```text
maximum requests: 1 through 1000
window seconds:   1 through 86400
```

Repository code does not claim that any particular deployment value is live. Live Worker, Pages binding, Turnstile dashboard, database, and secret configuration remain configured-environment verification work.

## Safe success response

Successful commit and deterministic replay use the same bounded `202 Accepted` shape:

```json
{
  "submissionReference": "CPM-S-2026-000123",
  "statusSecret": "<private follow-up secret>",
  "submittedAt": "<ISO timestamp>"
}
```

The response does not include:

- internal Submission UUID;
- raw IP address;
- opaque rate-limit bucket;
- provider response detail;
- database state;
- contact protection detail;
- workflow priority;
- reviewer state;
- canonical/public publication claims.

The status secret is returned for private follow-up use. It is not logged or persisted as plaintext by the existing intake contract.

## Safe error mapping

P5-02O maps internal failures to this bounded public vocabulary:

```text
400 suggest_request_invalid
409 suggest_request_conflict
413 suggest_request_too_large
415 suggest_media_type_unsupported
429 suggest_rate_limited
503 suggest_unavailable
```

### 400

Used for malformed HTTP envelopes, invalid UUID idempotency keys, invalid Suggest intake, abuse-request validation failure, and rejected challenge verification.

### 409

Used only for changed content under an already-used request UUID.

### 413

Used when the body byte limit is exceeded.

### 415

Used when the route media type is not `application/json`.

### 429

Used for distributed rate-limit denial. A bounded positive `Retry-After` header is included when the domain error carries a valid retry interval.

### 503

Used for fail-closed infrastructure and provider failures, including:

- missing or invalid trusted edge identity;
- bucket derivation failure;
- rate-limit provider unavailable;
- Turnstile provider unavailable;
- environment composition failure;
- contact protection failure;
- replay-integrity failure;
- database or other internal failure.

Provider errors, validation detail, secrets, raw IP addresses, and internal exception messages are not returned.

## Response security headers

All route responses include:

```text
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
```

Rate-limit responses additionally carry a bounded `Retry-After` header when available.

## Privacy boundary

The route temporarily uses the trusted edge identity for exactly two purposes:

1. derive the opaque rate-limit bucket;
2. optionally pass the IP ephemerally to the existing Turnstile Siteverify request.

The raw identity is not added to:

- Submission rows;
- Submission payloads;
- Submission contacts;
- Submission events;
- response bodies;
- public status projections;
- public exports.

No logging is introduced by this slice.

## Out of scope

P5-02O does not implement:

- public Suggest form UI;
- Turnstile widget rendering;
- browser request orchestration;
- Content Security Policy changes for Turnstile;
- configured live Worker deployment;
- configured live Pages Durable Object binding verification;
- configured live Turnstile hostname verification;
- production end-to-end submission exercise;
- public status page UI changes;
- canonical mutation;
- export or publication;
- P5-03 work.

## Completion criteria

P5-02O is complete when:

1. `POST /api/suggest` exists as a Pages Function route;
2. media type, UUID idempotency key, body-byte limit, and strict body shape are enforced before provider composition;
3. the existing Suggest schema is reused;
4. trusted edge identity is converted to an opaque rate-limit bucket before provider access;
5. rate limiting remains before Turnstile verification;
6. the environment composition uses the real DB, status-secret, contact protection, DO rate-limit, bucket derivation, Turnstile, and Suggest private-intake providers;
7. success returns only the bounded private receipt;
8. 400, 409, 413, 415, 429, and 503 mappings are tested;
9. 429 carries bounded `Retry-After` where available;
10. raw IP and internal provider detail are absent from public responses;
11. focused tests and runtime checks pass;
12. full GitHub CI passes;
13. no public form UI, canonical mutation, export, or publication behavior is added.
