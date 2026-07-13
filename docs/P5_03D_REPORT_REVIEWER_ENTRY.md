# P5-03D Protected report reviewer entry

**Implementation item:** P5-03D  
**Status:** Active  
**Last updated:** 2026-07-13

## Purpose

P5-03D connects persisted payment and problem reports to a protected read-only reviewer queue and detail workspace.

The slice establishes:

```text
private payment/problem report
↓
protected bounded queue summary
↓
strict normalized report detail
+
read-only canonical target context
+
exact Claim-context signals
+
bounded workflow event summary
```

P5-03D does not add reviewer decisions or mutations.

## 1. Authorization

The existing exact verified Submission reviewer policy remains authoritative:

```text
CPM_ADMIN_SUBMISSION_SUBJECTS
submission:read
```

Authorization occurs before query parsing or backend access.

Failure behavior remains bounded:

```text
missing or invalid policy → 503 unavailable
verified but unauthorized subject → 403 denied
missing verified identity → 403 denied
```

## 2. Protected report queue

Route:

```text
GET /admin/api/reports
```

Page:

```text
/admin/submissions
```

The queue reads only persisted submissions with:

```text
submission_type in (payment_report, problem_report)
normalized_payload is not null
```

Default actionable statuses:

```text
received
triage
in_review
needs_information
on_hold
```

Ordering and pagination remain deterministic:

```text
priority DESC
submitted_at ASC
id ASC
```

The queue exposes only:

- internal Submission ID for protected navigation;
- public Submission reference;
- report kind;
- target type and target ID;
- payment result or problem type;
- workflow status;
- priority;
- public evidence-link count;
- submitted and updated times.

It excludes original payloads, contact data, status-secret material, restricted evidence URLs, request fingerprints, rate-limit data, challenge tokens, event actor IDs, and internal notes.

## 3. Protected detail

Route:

```text
GET /admin/api/reports/:submissionId
```

Page:

```text
/admin/submissions/report-detail?id=<submission UUID>
```

The detail backend reads:

- bounded Submission metadata;
- strict normalized payment or problem report projection;
- up to 100 bounded workflow events.

Stored Submission type, target type, and target ID must match the normalized projection exactly. A mismatch fails closed.

## 4. Canonical target composition

The detail path composes P5-03C through a read-only Drizzle backend.

It resolves:

- Entity targets;
- Location targets and their owning Entity;
- Claim targets and their selected Claim;
- relevant Entity-level or Location-level Claims;
- Asset, Network, payment-method, and processor context.

The backend excludes deleted canonical rows and validates the resulting material through the P5-03C schema before display.

Target or Claim-context failure prevents partial reviewer detail from being presented as complete.

## 5. Reviewer workspace

The protected UI displays:

1. Submission summary;
2. normalized payment or problem report;
3. target Entity, optional Location, and public path;
4. bounded public-reportability reasons;
5. submitted public evidence links;
6. restricted-evidence presence flags without restricted URLs;
7. exact Claim-context reasons;
8. bounded workflow history.

It exposes no controls for:

- Evidence acceptance;
- Claim reconfirmation;
- Claim-state change;
- recheck-priority mutation;
- temporary hiding;
- correction application;
- duplicate decision;
- canonical mutation;
- export;
- publication.

## 6. Privacy boundary

The response schemas are strict and reject unexpected top-level operational fields.

The API does not return:

- plaintext or protected contact email;
- original payload;
- status secret or hash;
- request fingerprint;
- raw edge identity or rate-limit key;
- challenge token;
- restricted transaction/evidence URL;
- event actor ID;
- internal reviewer note.

Restricted evidence is represented only by a boolean presence flag already produced by P5-03A normalization.

## 7. Failure behavior

Queue states include loading, ready, empty, denied, unavailable, invalid response, retry, and load more.

Detail states include loading, ready, missing ID, denied, not found, unavailable, invalid response, and retry.

No private partial result is rendered after schema or target-context failure.

## 8. Validation

P5-03D adds:

- focused queue and detail contract tests;
- authorization failure tests;
- metadata/projection mismatch tests;
- strict private-field rejection tests;
- target-context composition tests;
- API authorization-before-loader tests;
- no-store response-header tests;
- bounded generic failure tests;
- runtime schema-check fixtures;
- built-artifact presence and leakage checks.

Configured Cloudflare Access and Neon execution remain deferred to P5-03I while repository-only development is active.

## 9. Completion criteria

P5-03D is complete when:

1. the protected report queue and detail routes are merged;
2. report normalized projections are revalidated before display;
3. metadata and normalized targets must match;
4. P5-03C target context is composed inside the detail read path;
5. backend or context failure fails closed;
6. reviewer responses exclude protected operational data;
7. the UI remains read-only;
8. focused tests, schema checks, build, accessibility, and staging artifact checks are green;
9. configured-environment execution is explicitly left to P5-03I.

## Next

After P5-03D merges green, proceed to P5-03E for the positive-payment Evidence and reconfirmation decision boundary. P5-03E must remain a separately authorized, idempotent, audited mutation and must not be inferred from the read-only Claim-context signals.
