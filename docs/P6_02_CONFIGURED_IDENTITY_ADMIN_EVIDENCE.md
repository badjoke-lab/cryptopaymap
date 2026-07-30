# P6-02 — Configured identity access and protected Admin evidence

## Decision

Identity-aware administration is a launch-blocking configured-environment gate. Repository implementation and documentation may prove the contract exists, but they cannot prove that Cloudflare Access, equivalent identity controls, deployed route coverage, or live capability decisions are configured correctly.

The configured-staging and configured-production evidence states therefore remain `unproven` until the procedures below execute and retain artifacts.

## Protected surface inventory

The execution receipt must enumerate every deployed administration surface in these classes:

- Admin pages;
- Admin data APIs;
- review mutation APIs;
- evidence and media decision APIs;
- ownership-verification APIs;
- canonical application APIs;
- publication and release APIs;
- audit-read APIs;
- security and configuration APIs.

A page-only Access policy is insufficient. Every protected API must independently reject requests that lack a validated identity and required capability.

## Identity assertion requirements

A passing execution proves all of the following server-side:

1. the assertion signature validates against the configured trusted key set;
2. issuer matches the configured Access team or equivalent identity provider;
3. audience matches the exact deployed Access application;
4. expiration and not-before bounds are enforced;
5. trusted identity is extracted only after assertion validation;
6. an unverified email header never creates an authenticated identity;
7. missing, malformed, expired, wrong-issuer, and wrong-audience assertions fail closed;
8. protected responses use private or no-store caching behavior;
9. tokens, cookies, assertions, and sensitive headers are absent from retained logs and artifacts.

## Capability allowlist

Authorization is explicit and server-side. The initial capability vocabulary is:

- `candidate:review`;
- `evidence:review`;
- `media:review`;
- `ownership:verify`;
- `canonical:apply`;
- `publication:run`;
- `audit:read`;
- `security:admin`.

Each protected route and mutation records its required capability. Authentication alone never grants every capability implicitly. Missing or unknown capability values fail closed.

## Required journey matrix

| Journey | Expected result | Required evidence |
| --- | --- | --- |
| Unauthenticated Admin page | Denied or redirected to identity challenge | status, redirect target class, safe headers |
| Unauthenticated Admin API | 401/403 without private response data | status and redacted response digest |
| Forged email header without assertion | Denied | status and audit-event class |
| Expired assertion | Denied | validation reason class, no token material |
| Wrong issuer | Denied | validation reason class |
| Wrong audience | Denied | validation reason class |
| Authenticated operator without capability | 403 | route, required capability, safe identity pseudonym |
| Permitted review operator | Allowed only for review action | action result and audit receipt |
| Review operator attempts publication | 403 | required capability mismatch evidence |
| Permitted publication operator | Allowed only after required confirmation and validation | publication-action receipt without activating a real public release unless separately authorized |
| Logout or session expiry | Subsequent request denied | bounded session evidence |

## Evidence receipt schema

Each staging and production run records:

- evidence id;
- environment;
- deployed revision;
- Access application identifier or safe digest;
- issuer and audience safe digests;
- policy revision identifier;
- route inventory digest;
- capability mapping digest;
- execution timestamp;
- journey results;
- redacted artifact location and digest;
- exceptions;
- operator;
- expiry or recheck date.

No raw assertion, session cookie, service token, email address, or secret header may appear in the receipt.

## Pass rule

P6-02 may be marked `passed` for an environment only when:

- the complete deployed route inventory is covered;
- every required negative journey fails closed;
- each representative positive journey is capability-bounded;
- audit events are created without secret leakage;
- retained artifacts are present and digest-verified;
- the evidence has not expired;
- no high-severity exception remains open.

A repository audit passing means only that this evidence contract is present and internally consistent.

## Recheck rule

Repeat configured evidence after any change to:

- Access application or policy;
- identity provider or trusted keys;
- audience or issuer configuration;
- protected route inventory;
- capability vocabulary or route mapping;
- session lifetime or cookie handling;
- Admin deployment architecture.

Otherwise, recheck before launch and at least every 90 days while the service remains operational.

## Current state

- Repository evidence contract: ready for executable audit.
- Configured staging evidence: `unproven`.
- Configured production evidence: `unproven`.
- Launch gate: blocked until both required environments have valid retained receipts.

## Boundary

This slice does not prove live Neon transactions, application receipt persistence, media lifecycle, public export activation, retention deletion, rollback, DNS, domain cutover, or launch readiness.

## Next owner

P6-03 owns live Neon canonical transaction and application receipt-chain evidence.


## Configured staging derived service authentication

Configured staging uses `CPM_ADMIN_AUTH_MODE=derived_staging_service`. Reviewer and publisher
HMAC keys are derived from the existing review seed with separate HKDF labels and synchronized
only to the Pages preview environment. Each request carries a role, timestamp, and HMAC signature;
the signature is verified with WebCrypto inside a bounded clock window. Unverified email headers,
missing signatures, stale signatures, and cross-role signatures fail closed. Production and the
default mode remain Cloudflare Access with issuer, audience, and signature validation. No raw key
or request signature may be retained in logs, receipts, artifacts, or repository files.
