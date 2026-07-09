# Audit history durable sources

**Implementation item:** P3-12C, extended by P5-01E  
**Status:** Active  
**Last updated:** 2026-07-09

## Purpose

The protected Audit history aggregates normalized metadata from existing durable decision and event tables.

No second audit write path is added. Existing source tables remain authoritative.

## Connected standard sources

The standard source registry includes:

- Candidate duplicate decisions;
- Candidate promotions;
- Evidence review decisions;
- Reconfirmation expirations;
- Media review decisions;
- export release decisions;
- export activation records;
- Submission workflow events.

Location profile correction remains a separate durable source appended by the protected Audit route.

Each standard source reads one extra row beyond its bounded source limit to report `hasMore`, maps records through metadata-only normalizers, and preserves deterministic source ordering.

## Submission event source

P5-01E adds `submission_event` under the `submission` Audit domain.

The source reads `submission_events` joined to `submissions` only for metadata required by the Audit projection:

```text
event ID
public Submission reference
Submission type
from status
to status
action
reason code
actor ID
actor type
created time
```

The source query does not select:

```text
internal note
intake request ID
request fingerprint
status token hash
original payload
normalized payload
proposed changes
encrypted email
email hash
contact permission
rate-limit key
remote IP
challenge token
```

The normalized Audit item targets the opaque public Submission reference rather than the internal Submission UUID.

Submitter and reviewer event actors normalize to the Audit `human` actor type. System events normalize to `system`. The original bounded actor ID remains available to protected Audit readers.

## Filter pushdown

Each source pushes applicable filters into its query before applying the source limit:

- actor ID;
- from and to timestamps;
- stable before timestamp and Audit item ID cursor;
- source-specific primary or secondary target filters.

The aggregate layer repeats normalized filters as a defense boundary.

The Submission source supports target filtering by:

```text
targetType=submission
targetId=CPM-S-YYYY-NNNNNN
```

Other target types return no Submission-source items.

## Cursor ordering

Source queries order by occurrence time descending and source record ID descending. At equal timestamps, cursor comparison uses the normalized `sourceKind:sourceRecordId` identity.

## Restore execution source

The restore execution contract has a normalized Audit mapper, but it is not registered as a Drizzle source because there is no production restore execution table in the repository schema.

The source registry does not claim durable database history for a record class whose table is not present.

## Failure and privacy behavior

Normalizers do not expose internal notes or arbitrary source payloads. Submission privacy is additionally enforced at query projection: private payload, contact, token, request-fingerprint, abuse-control, and network-origin fields are not selected for Audit normalization.

Source failures propagate through the aggregate fail-closed behavior, so partial history is not presented as complete.

## Explicit exclusions

This source aggregation does not itself add:

- a restore execution table;
- a public Audit endpoint;
- public Submission status history;
- live database verification;
- a production Submission route;
- a second Submission event write path.

P5-01E uses the existing protected Audit API and the durable `submission_events` rows created by the Submission workflow foundation.
