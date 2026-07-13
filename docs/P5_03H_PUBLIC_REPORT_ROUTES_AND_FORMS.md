# P5-03H Public payment and problem report routes and forms

**Implementation item:** P5-03H  
**Status:** Active  
**Last updated:** 2026-07-13

## Purpose

P5-03H exposes target-aware payment and problem report intake through the existing private Submission foundation.

The public boundary is:

```text
/report
→ strict browser payload builder
→ Turnstile
→ POST /api/reports
→ trusted Cloudflare edge identity
→ opaque rate-limit bucket
→ private report intake
→ private receipt
```

No public report changes Evidence, Claim, canonical, export, or publication state automatically.

## Public routes

### `GET /report`

The form supports:

- payment success or failure;
- target type `entity`, `location`, or `claim`;
- optional target prefill through `targetType` and `targetId` query parameters;
- asset, network, route, method, processor, context, and observed steps;
- public Evidence links;
- protected transaction or receipt URL;
- no-longer-accepts, closure, payment failure, wrong asset/network/instructions/address, duplicate, rights, privacy, and other problem categories;
- typed correction proposals allowed by the existing report contract;
- private contact and follow-up permission;
- privacy and submission acknowledgements;
- private receipt display.

### `GET /api/reports/config`

Returns only the client-safe Turnstile site key and action. It returns `503` when configuration is unavailable.

### `POST /api/reports`

Requires:

- `application/json`;
- a UUID `Idempotency-Key`;
- body size at or below 128 KiB;
- a bounded challenge token;
- a strict existing payment or problem report Submission envelope;
- trusted `CF-Connecting-IP` edge identity;
- configured opaque bucket derivation;
- configured distributed rate limiting;
- configured Turnstile verification;
- configured database, status-secret, and contact-protection providers.

Successful intake returns HTTP `202` with only:

```text
submissionReference
statusSecret
submittedAt
```

## Public error boundary

The route exposes bounded public errors only:

```text
400 report_request_invalid
409 report_request_conflict
413 report_request_too_large
415 report_media_type_unsupported
429 report_rate_limited
503 report_unavailable
```

Internal provider, database, encryption, secret, and validation details are not returned.

## Privacy separation

Public Evidence links and restricted evidence are separate fields.

- `evidenceLinks` may contain public reviewer-inspectable sources;
- `privateTransactionUrl` is retained only in the private payment payload;
- `privateEvidenceUrl` is retained only in the private problem payload;
- restricted URLs do not enter the normalized public projection;
- contact data remains behind the existing encryption and hash boundary;
- raw edge identity is ephemeral and only used to derive an opaque rate-limit bucket.

## Turnstile and response headers

`/report` receives the same bounded Turnstile Content Security Policy as `/suggest` in both static `_headers` and Pages response middleware:

```text
script-src challenges.cloudflare.com
frame-src challenges.cloudflare.com
connect-src self
form-action self
frame-ancestors none
```

The page is `no-store` with `no-referrer`.

## Idempotency

The browser creates one UUID per attempt and reuses it for safe retries. The existing private intake service determines:

```text
same UUID + same normalized request → replayed receipt
same UUID + changed request content → conflict
```

The browser generates a new UUID after HTTP `409`.

## Boundaries

P5-03H adds no:

- automatic Evidence acceptance;
- automatic Claim confirmation, stale, end, hide, or unhide;
- automatic canonical correction;
- automatic duplicate merge or deletion;
- public restricted evidence;
- export or publication mutation;
- configured live-environment completion claim.

Configured Cloudflare, deployed Function, live Neon, real Turnstile, first acceptance, replay, conflict, artifact stability, and protected reviewer journey remain assigned to P5-03I.

## Repository verification boundary

Repository validation covers strict schemas, HTTP ordering, body limits, error mapping, private receipt shape, browser builders, build output, CSP, secret-marker absence, tests, accessibility, staging artifacts, and migration drift.

## Next

After P5-03H merges green, proceed to P5-03I configured review and integration audit.
