# P5-02D Suggest reviewer entry

**Implementation item:** P5-02D  
**Status:** Active  
**Last updated:** 2026-07-10

## Purpose

P5-02D connects persisted Suggest submissions to a protected read-only reviewer entry path.

The slice establishes:

```text
private Suggest Submission
↓
protected queue summary
↓
protected detail read
↓
normalized Suggest proposal
+
P5-02C Candidate overlap signals
+
P5-02C canonical target signals
+
bounded workflow event summary
```

P5-02D does not add review decisions or mutations.

## 1. Authorization boundary

P5-02D introduces a separate Submission reviewer allowlist:

```text
CPM_ADMIN_SUBMISSION_SUBJECTS
```

The environment value is a bounded JSON array of exact verified Cloudflare Access subject identifiers.

Authorized identities receive:

```text
submission:read
```

The boundary is separate from Candidate read and Candidate promotion capabilities.

Failure behavior:

```text
missing or invalid policy → 503 unavailable
verified but unauthorized subject → 403 denied
missing verified identity → 403 denied
```

Authorization occurs before queue query parsing or detail backend access.

## 2. Protected queue

Route:

```text
GET /admin/api/submissions
```

Page:

```text
/admin/submissions
```

The current queue is Suggest-only and reads only persisted submissions with:

```text
submission_type = suggest
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

Queue ordering:

```text
priority DESC
submitted_at ASC
id ASC
```

The queue exposes only:

- internal Submission ID for protected navigation;
- public Submission reference;
- Suggest kind;
- proposed entity name;
- workflow status;
- priority;
- relationship disclosure;
- evidence-link count;
- submitted time;
- updated time.

It does not expose original payloads, contact data, status secret material, request fingerprints, internal notes, or mutation controls.

## 3. Protected detail

Route:

```text
GET /admin/api/submissions/:submissionId
```

Page:

```text
/admin/submissions/detail?id=<submission UUID>
```

The detail backend reads:

- bounded Submission metadata;
- normalized Suggest projection;
- up to 100 workflow events.

The event projection includes:

```text
fromStatus
toStatus
action
reasonCode
actorType
createdAt
```

It deliberately excludes:

```text
actorId
internalNote
```

## 4. Normalized proposal contract

The reviewer detail strictly validates the stored normalized Suggest projection before displaying it.

The projection includes:

```text
suggestionKind
entityType
entity
place
categories
paymentProposals
observedAt
relationship
evidenceLinks
```

Cross-field rules remain enforced:

```text
physical_place
→ entityType = merchant
→ place != null

online_service
→ entityType = online_service
→ place = null
```

Invalid stored normalized data fails closed and is not rendered as reviewer truth.

## 5. Signal composition

P5-02D calls the P5-02C signal service after normalized detail validation.

It composes:

- private Candidate overlap search;
- canonical target search;
- exact reason evaluation;
- explicit non-conclusive zero-result semantics.

Signal backend failure causes the detail request to fail closed.

The workspace does not show partial detail with missing signal coverage as though review input were complete.

## 6. Privacy boundary

The reviewer response contract is strict and rejects unexpected top-level private operational material.

The detail API does not return:

- plaintext contact email;
- protected contact ciphertext;
- email hash;
- original payload;
- status secret;
- status-token hash;
- request fingerprint;
- rate-limit key;
- remote IP;
- challenge token;
- event actor ID;
- internal reviewer note.

P5-02D is a reviewer entry surface, not a generic private-table serializer.

## 7. UI boundary

The queue UI shows bounded Suggest summary cards and protected navigation to detail.

The detail UI shows:

1. Submission summary;
2. normalized entity and Place/Online proposal;
3. category proposals;
4. payment proposals;
5. submitted evidence links;
6. Candidate overlap signals;
7. canonical target signals;
8. workflow event summary.

The UI includes no buttons for:

- duplicate decision;
- duplicate group creation;
- Candidate creation;
- existing-target selection;
- linking;
- Evidence acceptance;
- workflow transition;
- canonical mutation;
- export;
- publication.

Those remain later guarded operations.

## 8. Failure behavior

Queue states include:

- loading;
- ready;
- empty;
- denied;
- unavailable;
- invalid/unverified response;
- retry;
- load more.

Detail states include:

- loading;
- ready;
- missing ID;
- denied;
- not found;
- unavailable;
- invalid/unverified response;
- retry.

No private partial result is rendered after response-schema failure.

## 9. Validation coverage

P5-02D adds focused checks for:

1. authorized queue load;
2. unauthorized queue denial;
3. normalized detail validation;
4. P5-02C signal composition;
5. invalid normalized projection failure;
6. strict private-field rejection;
7. queue API authorization before loader access;
8. detail API authorization and route parameter validation;
9. private no-store administration headers;
10. generic backend failure responses;
11. runtime queue and detail response schema checks;
12. Astro route build and full repository validation.

## 10. Out of scope

P5-02D does not add:

- public `/suggest` form;
- public Suggest HTTP intake route;
- configured production provider wiring;
- reviewer decision actions;
- information request action;
- hold action;
- duplicate decision;
- accepted-as-Candidate transaction;
- canonical target selection mutation;
- canonical application transaction;
- Evidence acceptance;
- public status message persistence;
- export or publication.

## 11. Completion criteria

P5-02D is complete when:

1. exact verified Submission reviewer authorization exists;
2. protected Suggest queue is reachable and bounded;
3. protected Suggest detail is reachable and bounded;
4. normalized projection is revalidated before display;
5. P5-02C signals are generated inside the detail read path;
6. signal failure fails closed;
7. queue/detail contracts exclude protected operational data;
8. reviewer UI exposes no mutation controls;
9. focused tests and runtime checks are green;
10. full repository validation is green.

## Next

After P5-02D merges green, proceed to the next bounded P5-02 slice for the first guarded Suggest review action boundary. The action slice must remain separate from public route/form wiring and from canonical application transactions.
