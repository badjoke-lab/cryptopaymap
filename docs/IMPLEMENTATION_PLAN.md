# CryptoPayMap implementation plan

**Status:** Active  
**Last updated:** 2026-07-09

This file tracks repository implementation work. GitHub `main`, merged pull requests, and actual CI results are authoritative when this file differs from repository reality.

## Rules

- Implementation item IDs are independent of pull request numbers.
- Candidate, canonical, and public-export layers remain separate.
- Public intake never mutates canonical or public data directly.
- Each pull request has one primary responsibility and explicit completion checks.
- Live environment verification may be deferred only when the exact check and owner are recorded.
- Public product Roadmap and repository implementation status are separate documents.
- Phase 5 work must read `docs/PHASE5_IMPLEMENTATION_SEQUENCE.md`, `docs/SUBMISSION_WORKFLOW.md`, `docs/DATA_MODEL.md`, and `docs/SECURITY_AND_PRIVACY.md`.
- Media intake work must also read `docs/MEDIA_POLICY.md`.
- Phase 4 handoff evidence and retained Launch work are governed by `docs/P4_18_E_LIVE_REVIEW_AND_HANDOFF_AUDIT.md`.

## Phase 0 — Public specifications and development control

**Status:** Completed

P0-01 through P0-08 established repository control, product constitution, information architecture, data architecture, verification/source/license rules, submission and Media policy, technical/security/privacy architecture, operations, migration, launch criteria, and public Roadmap boundaries.

Completed through #1–#9.

## Phase 1 — Foundation

**Status:** Repository completed

P1-01 through P1-12 established:

- application foundation and responsive shell;
- design tokens and reusable interaction primitives;
- motion and reduced-motion behavior;
- query/UI/URL state boundaries;
- runtime schema and migration foundation;
- CI and test foundation;
- Cloudflare staging contract;
- PWA and accessibility baselines;
- public Roadmap and Changelog loaders;
- integration and quality audit.

Completed through #11–#23. The historical #23 live-check draft was closed as superseded after later fixed review deployment and deployment-receipt work.

## Phase 2 — Data core

**Status:** Completed

P2-01 through P2-14 established:

- Asset, Network, Payment Method, and Route registries;
- Entity and Location schema;
- Acceptance Claim status rules;
- Claim Asset/Network/Method combinations;
- Evidence and Source capture;
- Verification Event history;
- Candidate, provenance, and duplicate boundaries;
- Media metadata and legacy identifiers;
- public export schemas;
- public allowlist and leakage validation;
- physical Place and Online Service private importers;
- Phase 2 integration audit.

Completed through #24–#40.

Imported records remain private until reviewed. Candidate data is not public truth and does not automatically create Confirmed Claims.

## Phase 3 — Administration and review

**Status:** Repository completed and reconciled by P4-18D

P3-01 through P3-12 established:

- Admin data-access and transaction foundation;
- protected Admin shell and Access contract;
- dashboard and queue summaries;
- Candidate queue, detail, provenance, duplicate review, and identity resolution;
- new-target Promotion and existing-target linking;
- Evidence review and verification decisions;
- status transitions and Reconfirmation;
- Media review;
- export release decision, publication activation, release history, and restore repository boundaries;
- cross-domain protected Audit history.

Completed through #41–#95.

P4-18D later reconciled route reachability, Access identity mapping, UI/API compatibility, guard/replay/conflict/retry behavior, publication capability separation, and repository-versus-production restore classification.

## Phase 4 — Public core / MVP-A closure

**Status:** Completed for Phase 5 handoff

### Public core

P4-01 through P4-16 implemented:

- Place detail;
- PlacesApp shell;
- MapLibre map;
- result list and map/list synchronization;
- filters and bounded result updates;
- URL state and back restoration;
- mobile bottom sheet;
- Online Services discovery and detail;
- Home;
- Stats;
- Updates;
- public Roadmap and Changelog surfaces;
- trust, data, legal, and sustainability pages;
- public Media integration;
- MVP-A integration and quality audit.

Completed through #96–#122.

### P4-17 Places recovery

**Status:** Completed through #122

P4-17A through P4-17F reconciled the durable Places UX acceptance boundary, including map presentation, Place information, public projection, selected desktop panel, mobile sheet, Gallery/lightbox, external navigation, responsive behavior, accessibility, and final 17-point acceptance.

### P4-18 Phase 4 closure

| ID | Item | Status | Pull request |
|---|---|---|---|
| P4-18A | Tracking correction and closure inventory | Completed | #127 |
| P4-18B1 | Source and Candidate practical-profile contract | Completed | #128 |
| P4-18B2 | Promotion editor and field provenance parity | Completed | #130 |
| P4-18B3 | Canonical persistence and public projection integration | Completed | #132–#134 |
| P4-18B4 | Existing-record practical-profile correction path | Completed | #135–#138 |
| P4-18C | Bounded UI residual closure | Completed | #139, #141, #142 |
| P4-18D | Administration workflow integration audit | Completed | #143–#147 |
| P4-18E | Live review and Phase 5 handoff audit | Completed | #148 |

P4-18E closed the Phase 5 handoff gate while preserving unavailable configured-environment checks and production restore completion as explicit Launch work. Phase 5 may proceed; launch readiness is not claimed.

## Phase 5 — Public submissions / MVP-B

**Status:** Active

| ID | Item | Status | Depends on |
|---|---|---|---|
| P5-01 | Shared submission foundation | In progress | P4-18E |
| P5-02 | Suggest Place and Online Service | Planned | P5-01 |
| P5-03 | Payment and problem reports | Planned | P5-01, P5-02 target conventions |
| P5-04 | Business and service claims | Planned | P5-01, practical-profile correction path |
| P5-05 | Photo and Media submission intake | Planned | P5-01, P3-10 Media review boundary |
| P5-06 | Review workflow extensions | Planned | P5-02 through P5-05 |
| P5-07 | Canonical application transactions and retention | Planned | P5-06, P4-18B correction boundary |
| P5-08 | MVP-B integration audit | Planned | P5-01 through P5-07 |

### P5-01 — Shared submission foundation

P5-01 establishes common private submission infrastructure before individual public forms exist.

Required work:

1. define the common submission envelope and stable identifiers;
2. define opaque public reference behavior that reveals no private submission payload;
3. define private follow-up secret generation, storage representation, and verification boundary;
4. implement submission workflow status and allowed transitions needed by later intake types;
5. implement contact privacy boundaries and non-public defaults;
6. implement strict runtime parsing, payload limits, normalization, and fail-closed rejection;
7. define abuse-control and Turnstile verification boundary without coupling domain logic to one provider response shape;
8. implement idempotent intake semantics and changed-content conflict behavior;
9. establish durable private submission persistence and metadata-only audit foundation;
10. prove that intake cannot directly mutate Candidate, canonical, Evidence, Media review, verification, export, or public artifacts;
11. add focused schema, persistence, idempotency, privacy, and integration coverage;
12. document exactly which live environment checks remain for later configured-environment verification.

P5-01 should be divided into bounded slices rather than one large pull request.

Recommended slice order:

```text
P5-01A — submission contract and privacy model
    ↓
P5-01B — persistence and workflow-state foundation
    ↓
P5-01C — idempotent private intake service
    ↓
P5-01D — abuse-control / Turnstile boundary
    ↓
P5-01E — audit integration and Phase 5 foundation audit
```

P5-01 completion criteria:

- one shared submission contract can support later suggestion, report, claim, and Media intake families;
- all new submissions remain private by default;
- public reference and follow-up secret boundaries reveal no contact or payload data;
- identical retries are deterministic;
- reused idempotency identity with changed content fails conflict;
- contact data never enters public exports or metadata-only Audit output;
- abuse-control failure cannot create a durable accepted intake;
- intake cannot directly mutate canonical/public state;
- migration and schema checks are green;
- focused unit/integration tests and full repository validation are green;
- no later submission type is implemented prematurely inside the foundation item.

### P5-02 — Suggest Place and Online Service

Add public suggestion intake and protected review entry without direct canonical or public mutation. Useful but insufficient submissions may become private Candidates.

### P5-03 — Payment and problem reports

Add target-aware positive and negative payment reports plus factual, privacy, rights, duplicate, and other problem reports. Reports create review material and may trigger recheck priority; they do not automatically change Claim state.

### P5-04 — Business and service claims

Add claimant intake and ownership-verification workflow boundaries. Ownership verification does not bypass payment Evidence review or publication validation.

### P5-05 — Photo and Media submission intake

Add upload intake, quarantine, file validation, privacy and rights acknowledgements, and handoff to the existing protected Media review boundary. Original submissions remain non-public.

### P5-06 — Review workflow extensions

Add reviewer diffs, information requests, time-bounded holds, partial approval, duplicate/no-change handling, and private status communication required by real submission review.

### P5-07 — Canonical application transactions and retention

Apply approved field decisions through explicit guarded canonical transactions, preserve correction provenance and Audit history, run normal export/publication validation, and enforce private submission retention and deletion rules.

### P5-08 — MVP-B integration audit

Verify each submission type from public intake through private status, protected review, decision, canonical application where approved, public export, publication state, privacy boundaries, failure handling, and retention behavior.

## Phase 6 — Launch and cutover

**Status:** Planned

Required areas include:

- data and source/license validation;
- privacy and retention checks;
- mobile, accessibility, and performance validation;
- security review;
- redirects and sitemap;
- migration state;
- backup and monitoring;
- publication and rollback drills;
- retained configured-environment checks;
- production restore completion and drill.

Phase 6 must not claim launch readiness until retained P4-18D/E Launch work is complete or explicitly resolved by a later approved decision.

## Phase 7 — Stabilization

**Status:** Planned

Verify production errors, redirects, indexing, submissions, exports, mobile behavior, and migration completeness before retiring the legacy implementation.

## Retained Launch work

Starting Phase 5 does not waive:

- live Cloudflare Access and identity verification;
- actual allowlist and deployed Functions environment verification;
- live Neon migration-state verification;
- configured protected Admin journeys with representative data;
- canonical query → complete candidate generation → private upload → release-review handoff;
- corrected canonical value → generation → release → activation flow;
- concrete R2 publication conditional-write verification;
- production restore persistence, protected invocation, R2 adapter wiring, durable restore Audit source, post-switch reconciliation runbook, and production restore/replay drills.

The durable handoff record is `docs/P4_18_E_LIVE_REVIEW_AND_HANDOFF_AUDIT.md`.
