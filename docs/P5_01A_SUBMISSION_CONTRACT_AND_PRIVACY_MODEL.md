# P5-01A submission contract and privacy model

**Implementation item:** P5-01A  
**Status:** Active  
**Last updated:** 2026-07-09

## Purpose

P5-01A establishes the shared contract and privacy invariants used by all later public submission types before persistence, public forms, protected review workspaces, or canonical application logic are implemented.

The contract supports:

- `suggest`;
- `payment_report`;
- `problem_report`;
- `claim`;
- `photos`.

P5-01A does not implement those type-specific forms or approval rules.

## 1. Non-negotiable boundaries

1. A public submission is not canonical data.
2. A public submission is not public data.
3. Intake does not create, confirm, stale, end, hide, publish, or otherwise mutate an Entity, Location, Claim, Evidence, Media public state, or public artifact.
4. Safely parsed original payload remains distinct from later normalized review data and proposed canonical changes.
5. Public reference, internal UUID, status secret, stored token hash, and contact identity are separate values.
6. Plaintext status secrets are issued once and are not stored in the submission record contract.
7. Contact information and private evidence remain restricted and are excluded from public status projection.
8. Automated validation may reject malformed intake but does not approve factual claims.
9. Public status is a purpose-built safe projection rather than serialization of an operational submission row.
10. P5-01A creates no database migration and no public route.

## 2. Common submission intake envelope

The shared intake envelope contains:

```text
schemaVersion
submissionType
targetType / targetId
relationship
optional contact
evidenceLinks
originalPayload
acknowledgements
```

The envelope is strict. Unknown top-level fields are rejected.

Type-specific payload rules remain the responsibility of P5-02 through P5-05. P5-01A provides only a bounded JSON-safe common payload container so the shared intake boundary cannot accept unlimited nesting, node count, or request size.

### Common payload limits

The P5-01A contract enforces:

- maximum serialized payload size of 64 KiB;
- maximum nesting depth of 8;
- maximum total JSON node count of 2,000;
- maximum array length of 200 per common JSON array;
- maximum common string length of 20,000 characters;
- maximum common object-key length of 100 characters.

Later route contracts may impose narrower limits.

## 3. Submission type and workflow controls

Submission types:

```text
suggest
payment_report
problem_report
claim
photos
```

Workflow statuses:

```text
received
triage
in_review
needs_information
on_hold
resolved
duplicate
rejected_spam
withdrawn
```

Resolutions:

```text
approved
partially_approved
accepted_as_candidate
not_approved
duplicate
no_change
withdrawn
```

Submission workflow state remains separate from Acceptance Claim state.

## 4. Relationship disclosure

Common relationship values are:

```text
customer
employee
owner_or_authorized_representative
payment_provider
independent_researcher
other
```

Relationship disclosure informs review only. It does not determine Evidence class, verification status, ownership status, or publication eligibility automatically.

## 5. Public reference boundary

The initial public reference format is:

```text
CPM-S-YYYY-NNNNNN
```

Example:

```text
CPM-S-2026-000123
```

The public reference is not an authorization secret and reveals no private submission status by itself.

The reference is distinct from the internal UUID. Internal UUIDs must not be used in public submission-status URLs.

P5-01A provides format validation and deterministic formatting from a year/sequence input. Allocation and uniqueness under concurrency belong to P5-01B persistence work.

## 6. Status secret boundary

The status follow-up boundary uses:

- a 32-byte random secret source;
- a URL-safe plaintext secret representation;
- SHA-256 stored hash representation;
- verification against the stored representation;
- a verification function that returns false for malformed inputs rather than disclosing record state through parse errors.

Plaintext secret format:

```text
cpmss_<base64url-encoded 32-byte entropy>
```

Stored representation:

```text
sha256:<64 lowercase hexadecimal characters>
```

The high-entropy plaintext secret is returned to the caller for one-time delivery. It is not part of `SubmissionRecord`.

P5-01A does not implement token rotation, revocation persistence, short-lived follow-up sessions, recovery by verified contact, or rate limiting. Those are later service/persistence responsibilities.

## 7. Contact privacy boundary

Common intake may carry optional contact input.

P5-01A validates the private input shape but does not define plaintext email storage.

P5-01B/C must preserve:

- encrypted email storage;
- normalized email hash only where duplicate or abuse control requires it;
- separate `contact_allowed` state;
- retention/deletion scheduling;
- no public contact projection;
- no contact value in metadata-only Audit output.

The common public status projection contains no email or contact field.

## 8. Evidence-link boundary

Common evidence-link intake accepts HTTP or HTTPS URLs only.

The pure contract rejects:

- unsupported schemes;
- embedded URL credentials;
- localhost names;
- `.local` names;
- loopback IPv4 literals;
- RFC1918 private IPv4 literals;
- link-local IPv4 literals;
- obvious unspecified or IPv6 loopback literals.

This pure validation is not a complete SSRF defense. Any later server-side fetch must additionally perform safe DNS resolution, block private/link-local/metadata destinations after resolution and redirects, limit redirects and response size, and fail closed.

Evidence-link summary text is plain text and rejects HTML-like `<` or `>` content.

## 9. Original payload preservation

`originalPayload` is a safely parsed private payload container.

P5-01A schemas validate without applying normalization transforms to its contents. Tests verify that parsing does not rewrite the supplied original payload object.

Later normalized review projection and proposed changes must be stored separately. They must not overwrite `originalPayload`.

## 10. Public status projection

The public/private follow-up response contract is purpose-built and allowlisted.

Allowed fields are limited to:

- public reference;
- bounded public-facing status label;
- requested action;
- public message;
- linked public record reference when publication has succeeded;
- bounded Media decision summaries belonging to the same submission;
- permitted submitter response actions.

The projection does not accept:

- internal notes;
- priority;
- reviewer identity;
- abuse signals;
- contact email;
- original payload;
- normalized review payload;
- ownership proof;
- private Evidence;
- status token hash.

The schema is strict so accidental extra private fields fail validation.

## 11. Public-facing status labels

Internal workflow states and resolutions map to a bounded public vocabulary:

```text
received
under_review
more_information_needed
on_hold
approved
partially_approved
accepted_as_candidate
not_approved
closed
```

Duplicate, no-change, withdrawn, rejected-spam, and other terminal non-public-detail outcomes map to the bounded `closed` label unless a later explicit public-safe contract adds a more specific label.

## 12. P5-01A implementation result

P5-01A adds:

- `src/submissions/contract.ts`;
- `src/submissions/status-secret.ts`;
- focused submission contract tests;
- focused status secret issuance/hash/verification tests;
- this durable contract and privacy model.

## 13. Out of scope

P5-01A does not implement:

- submission database tables or migrations;
- public intake routes or forms;
- Turnstile verification;
- rate limiting;
- idempotent persistence;
- status-session cookies;
- contact encryption service;
- private status API route;
- review UI;
- type-specific approval logic;
- Candidate creation;
- canonical mutation;
- Evidence acceptance;
- Media processing;
- export or publication.

## 14. Completion criteria

P5-01A is complete when:

1. common intake shape is strict and bounded;
2. submission type/status/resolution values match the durable workflow contract;
3. public reference format is explicit and validated;
4. status secret issuance uses 32-byte entropy and stores only a one-way hash representation;
5. status verification rejects malformed or incorrect secrets without revealing record state;
6. original payload parsing does not rewrite the supplied private payload;
7. common evidence URL validation rejects obvious unsafe destinations and credentials;
8. public status projection rejects private review/contact fields;
9. focused tests and full repository validation are green;
10. no database, public route, canonical mutation, or type-specific form is introduced.

## Next

After P5-01A is green and merged, proceed to:

```text
P5-01B — persistence and workflow-state foundation
```

P5-01B must implement the durable private submission tables, workflow-event foundation, public-reference allocation boundary, secret-hash persistence, and private payload/contact separation without adding public forms or canonical mutation.
