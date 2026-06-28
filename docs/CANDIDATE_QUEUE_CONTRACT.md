# CryptoPayMap Candidate queue contract

## Purpose

P3-04 adds a protected read-only queue for reviewing bounded Candidate summaries.

```text
verified Cloudflare Access identity
  -> exact Candidate subject allowlist
  -> candidate:read capability
  -> validated filters and cursor
  -> purpose-built private queries
  -> validated summary page
  -> queue interface states
```

The queue is not a Candidate detail view and does not provide review decisions or writes.

## Authorization

The Candidate endpoint reads the deployment-only environment value:

```text
CPM_ADMIN_CANDIDATE_SUBJECTS
```

The value is a JSON array of exact verified Cloudflare Access subject identifiers.

Rules:

- subject identifiers, not email addresses, grant access;
- exact match grants only `candidate:read`;
- missing or malformed configuration fails closed;
- dashboard access does not imply Candidate access;
- Candidate access does not grant mutation, duplicate resolution, promotion, or publication capability.

## Endpoint

```text
GET /admin/api/candidates
```

The route remains under the shared `/admin` Access assertion middleware.

Responses use private, no-store, noindex, and no-referrer headers.

Failure shapes:

```text
HTTP 400
{ "error": "candidate_queue_invalid_query" }

HTTP 403
{ "error": "candidate_queue_denied" }

HTTP 503
{ "error": "candidate_queue_unavailable" }
```

Errors do not reveal whether any specific Candidate, source, duplicate group, or canonical record exists.

## Filters

Supported filters:

- `status`: one or more Candidate workflow states;
- `type`: one or more Candidate types;
- `source`: one or more source types;
- `priority`: `all`, `high`, `standard`, or `unscored`;
- `duplicate`: `all`, `flagged`, or `unflagged`;
- `limit`: 1 through 50;
- `cursor`: validated opaque continuation value.

When status is omitted, the queue defaults to `new` and `triaged` Candidates.

Priority bands:

```text
high      800 through 1000
standard  0 through 799
unscored  null
```

## Stable ordering and pagination

The queue uses one fixed ordering:

```text
priority descending, with null treated as -1
last_seen_at descending
Candidate UUID descending
```

The cursor contains the three ordering values from the last returned Candidate. The endpoint validates decoded cursor shape, timestamp, priority range, UUID, and total encoded length.

Page size is capped at 50. The backend requests one additional row to determine whether a next page exists, then removes that extra row before returning results.

## Returned Candidate fields

Each queue item may contain only:

- opaque Candidate UUID for protected navigation;
- normalized display name;
- Candidate type;
- workflow status;
- priority;
- first-seen, last-seen, and updated timestamps;
- distinct source types and aggregate source-record count;
- duplicate-signal boolean and duplicate-group status;
- boolean indicating whether a canonical link exists.

The UUID supports later protected navigation but does not expose the linked canonical identifiers.

## Excluded data

The queue must not return or embed:

- raw source payloads;
- source URLs or archive URLs;
- source external IDs;
- Candidate notes;
- canonical entity or location IDs;
- duplicate-group membership details;
- Evidence content or URLs;
- contact details;
- submissions or status tokens;
- media storage keys or private files;
- administration identity or Access assertion content;
- review or write controls.

Candidate detail and provenance expansion belong to P3-05. Duplicate decisions belong to P3-06. Canonical promotion belongs to P3-07.

## Query implementation

The private Drizzle backend:

- applies Candidate filters before selecting rows;
- uses a source-type subquery without returning source records;
- joins duplicate groups only for group status;
- selects summary fields only;
- loads source-type and count summaries only for the returned page;
- never serializes full database rows;
- returns no partial page if validation fails.

## Interface states

The Candidate page provides:

- loading;
- validated results;
- valid empty page;
- denied;
- unavailable;
- invalid query;
- invalid response;
- retry;
- filter reset;
- cursor-based load more.

The browser validates the complete page schema before displaying values. Invalid responses are not partially rendered.

## Testing

Repository checks cover:

- exact-subject authorization;
- filter parsing and defaults;
- cursor round-trip and malformed cursor rejection;
- authorization before backend access;
- page invariants and response validation;
- endpoint 200, 400, 403, and 503 behavior;
- filtering and pagination interface behavior;
- denied and invalid-response states;
- runtime contract checks;
- static artifact privacy markers;
- formatting, lint, TypeScript, tests, build, and accessibility foundations.

Live database results and live Cloudflare Access browser verification remain deployment checks and are not claimed by repository-only tests.
