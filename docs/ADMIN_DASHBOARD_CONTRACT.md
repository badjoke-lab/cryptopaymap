# CryptoPayMap administration dashboard contract

## Purpose

P3-03 adds a protected, read-only operational overview for administration work.

```text
verified Cloudflare Access identity
  -> exact subject allowlist
  -> dashboard:read capability
  -> bounded private database aggregations
  -> validated summary response
  -> dashboard states
```

The dashboard does not replace Candidate, Evidence, media, recheck, or publication review screens.

## Authorization

The Access middleware must first place a verified administration identity in the protected request context.

The dashboard endpoint then reads:

```text
CPM_ADMIN_DASHBOARD_SUBJECTS
```

The value is a deployment-only JSON array of exact verified Access subject identifiers. It is not committed to the repository or embedded in static output.

Authorization rules:

- subject identifiers, not email addresses, grant access;
- an exact allowlist match grants only `dashboard:read`;
- missing or malformed policy fails closed;
- an identity that is absent, inconsistent, or not allowlisted is denied;
- dashboard access grants no write, promotion, Evidence decision, media decision, or publication capability.

## Endpoint

```text
GET /admin/api/dashboard
```

The endpoint remains under the P3-02 `/admin` Access middleware.

Successful responses use:

```text
HTTP 200
Content-Type: application/json
Cache-Control: private, no-store
Referrer-Policy: no-referrer
X-Robots-Tag: noindex, nofollow, noarchive
```

Failure responses:

```text
HTTP 403
{ "error": "dashboard_denied" }

HTTP 503
{ "error": "dashboard_unavailable" }
```

Responses do not reveal whether a specific record, source, submission, Evidence item, or media file exists.

## Summary fields

The response is limited to:

- actionable Candidate counts by workflow state;
- high-priority Candidate count;
- open duplicate-group count;
- pending Evidence review count;
- overdue, due-soon, and stale recheck counts;
- pending media review count;
- latest import completion time and aggregate counts;
- publication availability state;
- up to ten recent verification event types and effective times;
- summary generation time.

The summary schema enforces nonnegative bounded integers and requires actionable Candidate totals to equal new plus triaged counts.

## Excluded data

The dashboard endpoint and static page must not return or embed:

- Candidate IDs or names;
- source-record IDs, URLs, or raw payloads;
- duplicate-group membership details;
- canonical entity, location, or claim IDs;
- Evidence summaries, URLs, internal notes, or source content;
- submission contacts or status tokens;
- media storage keys, filenames, or private files;
- administrator email addresses or Access assertion content;
- database configuration;
- canonical write controls;
- public release controls.

## Database aggregation

The private Drizzle backend executes purpose-built aggregate queries rather than serializing tables.

Operational definitions:

- actionable Candidates: `new` plus `triaged`;
- high priority: actionable Candidates with priority at least 800;
- open duplicates: duplicate groups with `open` status;
- pending Evidence: non-deleted Evidence with `pending` review status;
- overdue rechecks: non-deleted confirmed claims whose review date is at or before the summary time;
- due soon: non-deleted confirmed claims due after the summary time and within 30 days;
- stale: non-deleted claims currently marked stale;
- pending media: non-deleted media with pending review status;
- recent activity: event type and effective time only.

No count is presented as a public product statistic.

## Publication state

P3-03 always reports publication as unavailable:

```text
state: not_available
reason: release_control_not_implemented
```

P3-03 does not infer release readiness from Candidate, Evidence, or claim counts. Explicit release control belongs to P3-11.

## Interface states

The React dashboard provides:

- loading;
- ready;
- zero-work empty state;
- denied;
- unavailable;
- invalid-response error;
- manual retry.

The browser validates the response schema before displaying values. An invalid response is not partially rendered.

## Testing

Repository checks cover:

- policy parsing and exact subject authorization;
- protected identity consistency;
- authorization before backend access;
- bounded summary schema and invariants;
- generic endpoint failure responses;
- private response headers;
- loading, ready, denied, invalid-response, and retry UI behavior;
- static artifact privacy markers;
- runtime summary checks;
- formatting, lint, TypeScript, build, and accessibility foundations.

Live database counts and live Cloudflare Access browser verification remain deployment checks. They are not claimed by repository-only tests.

## Later Phase 3 work

Later items may link dashboard cards to protected detail routes. They must preserve:

- explicit capabilities per operation;
- no detail payload in dashboard summaries;
- no dashboard write actions;
- no automatic Candidate promotion;
- no publication action before P3-11;
- private, no-store responses.
