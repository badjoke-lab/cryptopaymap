# CryptoPayMap project status

**Last verified:** 2026-06-28

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-03 — Dashboard and operational queue summaries

## Active pull request

[#43 — P3-03: Add operational dashboard summaries](https://github.com/badjoke-lab/cryptopaymap/pull/43)

## Latest completed work

- Phase 2 completed through pull request #40.
- P3-01 completed through pull request #41.
- P3-02 completed through pull request #42.
- `/admin` and descendant routes use a fail-closed Pages Function boundary.
- Cloudflare Access assertions are checked for signature, issuer, audience, expiration, and not-before values.
- Administration identity is derived only from verified claims and placed in protected request context.
- Successful and failed administration responses use private, no-store, noindex, and no-referrer behavior.
- The responsive administration shell exposes navigation and placeholders without private records or write controls.
- Candidate-to-canonical promotion and public export publication remain disabled.

## P3-03 work in progress

- define a strict bounded summary contract and read-only `dashboard:read` capability
- map exact verified Access subject identifiers to dashboard access without using email addresses
- aggregate Candidate, duplicate, Evidence, recheck, media, import, and recent event totals through purpose-built private queries
- expose the summary through protected `/admin/api/dashboard`
- validate the response again in the browser before rendering values
- provide loading, ready, zero-work, denied, unavailable, invalid-response, and retry states
- keep Candidate identifiers, source payloads, contacts, Evidence content, media keys, and write controls out of dashboard responses
- keep publication unavailable until the dedicated P3-11 release workflow
- add authorization, service, endpoint, component, runtime, build, and artifact checks

## Cloudflare status

Live staging, Access browser verification, and live database aggregation remain deferred. Repository-level authorization, query, API, UI, and fail-closed contracts proceed without live credentials.

## Next

1. Complete pull request #43 implementation and CI.
2. Verify that static artifacts contain no private dashboard configuration or payload markers.
3. Merge P3-03 after all checks pass.
4. Advance to P3-04 — Candidate queue.

## Blocked

No repository blocker. Only live deployment and database verification are deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
