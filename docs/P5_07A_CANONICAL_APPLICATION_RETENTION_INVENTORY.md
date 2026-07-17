# P5-07A canonical application and retention inventory

**Implementation item:** P5-07A  
**Status:** Active — repository inventory  
**Last updated:** 2026-07-17

## Purpose

P5-07A defines the real starting point for canonical application and retention work after P5-06 review workflows became repository-complete.

The repository already contains several guarded atomic canonical transactions. P5-07 must reuse and reconcile those boundaries rather than create a second incompatible application system.

This slice adds no new mutation, migration, reviewer control, retention deletion, scheduler, export action, publication action, deployment, or launch claim.

## Governing order

The Submission policy remains:

```text
review decision
→ canonical transaction
→ publication pending
→ public projection validation
→ release activation
```

Canonical commit and public release are distinct. A canonical transaction must not activate export or claim that a change is already public.

## Existing application inventory

### 1. Suggest accepted as Candidate

A Suggest Submission may currently resolve as `accepted_as_candidate` and create a private Candidate. It does not directly create canonical truth.

The existing P3-07 Candidate boundaries already provide two atomic paths:

| Path | Existing effect |
|---|---|
| New-target promotion | Creates hidden Entity, optional Location, candidate Acceptance Claim, Claim Assets, provenance, promotion receipt, and Candidate linkage. |
| Existing-target link | Reuses an exact Entity/Location target, creates a candidate Acceptance Claim and Claim Assets, writes provenance, and records the Candidate linkage. |

Both paths are exact-versioned, replayable, private, and separated from export. P5-07 must bind the originating Submission/Candidate decision to one of these existing receipts instead of copying the promotion implementation.

**Gap:** there is no common Submission application receipt that records which Candidate promotion or existing-target-link receipt completed the originating Suggest contribution.

### 2. Positive payment reports

The positive-payment decision transaction already:

- validates the exact Submission, normalized payload, Claim, and complete Claim Asset set;
- creates accepted supporting Evidence;
- resolves the Submission as `approved`;
- optionally reconfirms or restores the Acceptance Claim;
- writes a Verification Event and Evidence relationship;
- commits the batch atomically and replay safely.

This is already a canonical-affecting transaction.

**Gap:** it uses its type-specific Submission event as the durable receipt. P5-07 must inventory publication-pending semantics and retention assignment without wrapping the transaction in a second canonical write.

### 3. Negative payment and problem Evidence

The negative-Evidence transaction already:

- creates accepted contradicting Evidence;
- resolves the Submission as `approved`;
- records whether recheck priority was requested.

It intentionally does not mutate the Acceptance Claim or create a Verification Event.

**Gap:** the current `accept_and_prioritize_recheck` result is represented in the Submission decision event, but the backend does not create a durable recheck work item. P5-07 must define whether the existing Claim `nextReviewAt`, a dedicated recheck record, or another existing queue boundary owns that state before adding any write.

### 4. Problem reports

The P5-03G problem decision boundary has three distinct classes:

| Decision | Existing effect |
|---|---|
| Correction approval | Resolves the Submission and stores a typed `approve_correction_handoff`; no Entity or Location correction is applied. |
| Urgent hide | Temporarily hides an exact Acceptance Claim and records a Verification Event. |
| Negative Claim action | After accepted contradicting Evidence, explicitly marks a Claim stale or ended and records a Verification Event. |

Duplicate and no-change outcomes are also durable.

**Gap:** typed Entity/Location correction handoffs still require an exact canonical application transaction with before/after validation and field-level provenance.

### 5. Business Claim field application

P5-04H already provides:

- exact approved Submission and relationship-decision guards;
- exact Entity or Location `updatedAt` expectations;
- complete accepted/rejected field partitions;
- validated canonical before/after projections;
- one-time replay-safe persistence;
- atomic Entity or Location updates and a durable Submission application event.

This is already a canonical application path and must remain the owner of Business Claim profile corrections.

The current ordering requires the Submission to be `resolved / approved` before the field application commits. The application then updates the Submission timestamp and appends `business_claim_fields_applied`.

**Gaps:**

- accepted payment proposals are retained in the application projection but are not inserted as canonical Claim Assets by the current Drizzle backend;
- the backend does not visibly create field-level provenance rows for accepted Entity or Location changes;
- the common public-status model does not distinguish approved-but-application-pending from applied-but-publication-pending;
- application ordering must be reconciled without invalidating existing replay receipts.

### 6. Photos and Media

The P3-10 Media review transaction already:

- guards exact Media Asset and complete Media File state;
- applies private/public/rejected/restricted/superseded state transitions;
- writes the durable Media review receipt;
- replays identical requests and rejects changed-content reuse.

P5-06E derives the Photos parent result from the complete initial child decision set.

**Gap:** parent resolution and Media review receipts are separate, but no common Submission application receipt links the parent outcome to completed child Media application and later release state. Export/release must remain outside Media review.

## Existing retention inventory

### Submission contacts

`submission_contacts` already has:

- encrypted email;
- normalized email hash;
- `contactAllowed`;
- nullable `retentionUntil`;
- a retention index.

**Gap:** the repository does not yet provide a common execution job that selects expired contact rows, preserves allowed abuse/audit facts, and removes or irreversibly redacts the encrypted contact value.

### Submission payloads and private Evidence

`submission_payloads` preserves immutable original, normalized, and proposed values. It currently has no retention/deletion timestamp.

The policy requires retention classes to be separated rather than deleting a whole Submission indiscriminately.

**Gap:** no common retention assignment or execution boundary currently classifies:

- immutable audit facts;
- original and normalized payloads;
- encrypted contact;
- private Evidence URLs or attachments;
- ownership proof;
- abuse-control hashes;
- status history;
- canonical contribution receipts.

### Photo private objects

P5-05F already provides a provider-neutral private object cleanup service for:

- expired unconsumed upload authorization;
- terminal Photos Submissions without Media handoff after 30 days;
- rejected Media after 30 days;
- superseded Media after 30 days.

It validates canonical private object keys, continues after independent failures, and keeps limited audit/decision/hash metadata.

**Gap:** no scheduler or configured production execution owns this cleanup yet. P5-07 should integrate scheduling and receipts without broadening deletion to accepted, public, pending, or unrelated Media.

## Missing common application lifecycle

There is no common `submission_application_decisions` table or equivalent shared receipt in the current Submission schema.

Type-specific receipts already exist and must remain authoritative:

- Candidate promotion decision;
- positive/negative report Submission event;
- problem-report decision event;
- Business Claim field-application event;
- Media review decision;
- Photos parent-resolution event.

A common P5-07 lifecycle should reference those receipts and expose bounded state. It must not duplicate their canonical rows or weaken their exact-state guards.

The required internal lifecycle is:

```text
review_decided
→ application_pending
→ application_committed | application_failed
→ publication_pending
→ publication_committed | publication_failed
```

The final schema names remain a P5-07B design decision. Existing public `approved` and `partially_approved` labels must not be interpreted as proof that a release is already active.

## Proposed bounded P5-07 sequence

The inventory establishes this implementation sequence:

```text
P5-07A — canonical application and retention inventory
    ↓
P5-07B — common application lifecycle and receipt references
    ↓
P5-07C — Suggest Candidate promotion/link receipt binding
    ↓
P5-07D — report correction and durable recheck application
    ↓
P5-07E — Business Claim payment/provenance/application-order completion
    ↓
P5-07F — Photos parent, Media receipt, and publication-handoff reconciliation
    ↓
P5-07G — contact, payload, Evidence, proof, and Media retention execution
    ↓
P5-07H — cross-submission canonical and retention integration audit
```

Each slice must use a separate branch and pull request. The sequence may be split further when one item contains more than one atomic owner, but later work must not collapse canonical application and public release into one transaction.

## P5-07B entry boundary

The next slice should define only the common application lifecycle and references.

It may add:

- a strict application state/receipt contract;
- exact references to type-specific decision and application receipts;
- one durable common application record if a migration is justified;
- replay, changed-reference conflict, and one-application-per-Submission guards;
- bounded protected read projection;
- publication-pending separation.

It must not yet:

- promote a Candidate;
- apply a problem correction;
- create Claim Assets;
- update Entity, Location, Claim, Evidence, or Media;
- delete private material;
- activate export or release;
- claim configured deployment.

## Executable audit

The repository inventory is enforced by:

```text
node scripts/check-p5-07a-canonical-retention-inventory.mjs
```

It runs in the normal schema validation chain and fails when an inventoried owner or gap changes without updating this document and the next implementation boundary.

## Completion condition

P5-07A is complete when:

1. the executable inventory is registered in `schema:check`;
2. all normal pull-request workflows pass;
3. existing canonical owners and known gaps are documented;
4. P5-07B is the next bounded item;
5. no runtime mutation, migration, deletion, scheduler, export, or publication behavior is added by this inventory PR.
