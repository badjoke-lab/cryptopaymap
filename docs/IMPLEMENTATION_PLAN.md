# CryptoPayMap implementation plan

**Status:** Active  
**Last updated:** 2026-07-11

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
| P5-01 | Shared submission foundation | Completed through #150–#155 | P4-18E |
| P5-02 | Suggest Place and Online Service | In progress | P5-01 |
| P5-03 | Payment and problem reports | Planned | P5-01, P5-02 target conventions |
| P5-04 | Business and service claims | Planned | P5-01, practical-profile correction path |
| P5-05 | Photo and Media submission intake | Planned | P5-01, P3-10 Media review boundary |
| P5-06 | Review workflow extensions | Planned | P5-02 through P5-05 |
| P5-07 | Canonical application transactions and retention | Planned | P5-06, P4-18B correction boundary |
| P5-08 | MVP-B integration audit | Planned | P5-01 through P5-07 |

### P5-01 — Shared submission foundation

**Status:** Completed through #150–#155

P5-01 established common private Submission infrastructure before individual public forms exist.

Completed slices:

```text
P5-01A — submission contract and privacy model                  #150
    ↓
P5-01B — persistence and workflow-state foundation             #151
    ↓
P5-01C — idempotent private intake service                     #152
    ↓
P5-01D — abuse-control / Turnstile boundary                    #153
    ↓
P5-01E — Audit integration and A–D foundation audit            #154
    ↓
P5-01F — private follow-up status read boundary                #155
```

P5-01 completion provides:

- one common Submission envelope for later Suggest, Report, Claim, and Media intake families;
- opaque public reference and follow-up secret separation;
- private durable persistence and workflow events;
- contact protection boundary and non-public defaults;
- strict parsing and bounded payload rules;
- deterministic replay and changed-content conflict;
- provider-neutral abuse-control and challenge-verification boundaries;
- Turnstile Siteverify adapter boundary;
- metadata-only Submission Audit history;
- private follow-up status read through public reference plus valid secret;
- same bounded service failure for missing reference and wrong secret;
- no direct Candidate, canonical, Evidence, Media review, verification, export, or public mutation from intake;
- green migration, schema, focused test, and full repository validation gates.

Configured environment wiring remains required when the first public Suggest route is introduced.

### P5-02 — Suggest Place and Online Service

**Status:** In progress at public Suggest route/form wiring

P5-02 adds Suggest-specific intake, protected review entry, bounded review signals, and separately guarded reviewer operations without direct canonical or public mutation. Useful but insufficient submissions may become private Candidates only after an explicit protected decision transaction.

Completed and active slices:

```text
P5-02A — Suggest type-specific contract and review-safe normalization       Completed #156
    ↓
P5-02B — Suggest private intake integration                               Completed #157
    ↓
P5-02C — duplicate Candidate and existing-target read-only signals        Completed #158
    ↓
P5-02D — protected Suggest reviewer queue and detail entry                 Completed #159
    ↓
P5-02E — guarded received→triage and triage→in_review transitions          Completed #160
    ↓
P5-02F — guarded in_review→needs_information request                       Completed #161
    ↓
P5-02G — guarded time-bounded in_review→on_hold operation                  Completed #162
    ↓
P5-02H — atomic accepted-as-Candidate outcome                              Completed #163
    ↓
P5-02I — Submission status-secret environment binding                     Completed #167
    ↓
P5-02J — Submission contact protection                                    Completed #168
    ↓
P5-02K — Opaque Submission rate-limit bucket derivation                    Completed #169
    ↓
P5-02L — Trusted Cloudflare edge identity extraction                       Completed #170
    ↓
P5-02M — Durable Object distributed Submission rate limiting               Completed #171
    ↓
P5-02N — Turnstile environment binding                                    Completed #172
    ↓
P5-02O — Public Suggest HTTP route and safe response mapping               Completed #173
    ↓
P5-02P — Public Suggest form and Turnstile browser wiring                  In progress
    ↓
configured-environment verification
    ↓
P5-02 integration and handoff audit
```

P5-02A established:

- physical Place and Online Service Suggest kinds;
- new-record-only target rules;
- entity identity and official URL proposals;
- Place address, coordinate, and practical-profile proposals;
- category proposals;
- payment Asset, Network, Route, Method, Processor, How-to-pay, and restriction proposals;
- explicit uncertainty for incomplete but useful proposals;
- no Asset-to-Network inference;
- required relationship disclosure;
- observation date and common Evidence-link composition;
- review-safe normalization.

P5-02B established:

- reusable type-specific parser/normalizer injection into private intake;
- strict Suggest parsing before contact protection and durable persistence;
- atomic original/normalized private payload persistence;
- deterministic Suggest replay and changed-content conflict behavior;
- abuse-control composition before Suggest intake;
- generic P5-01 intake backward compatibility.

P5-02C established:

- read-only Candidate overlap signals using existing duplicate-signal vocabulary;
- physical same-name-and-coordinate Candidate review signals;
- Online Service official-domain strong signals and normalized-name review signals;
- reuse of the existing canonical target search backend and target option contract;
- bounded canonical target reasons for name, official domain, address, and near coordinates;
- explicit `absenceIsConclusive: false` semantics for zero-result bounded searches;
- fail-closed behavior when either Candidate or canonical target search cannot complete;
- no automatic duplicate decision, Candidate creation, target selection, linking, canonical mutation, export, or publication.

P5-02D established:

- protected Suggest queue and detail read paths;
- separate Submission read authorization;
- normalized proposal validation before reviewer display;
- P5-02C signal composition inside the protected detail path;
- bounded workflow-event summary without arbitrary private-field serialization;
- read-only reviewer workspace without mutation controls.

P5-02E established:

- separate Submission transition authorization;
- exact-state guarded `received → triage` and `triage → in_review` operations;
- atomic workflow event persistence;
- deterministic request UUID replay identity;
- concurrent identical request replay recovery;
- bounded conflict responses and reviewer action controls.

P5-02F established:

- exact-state guarded `in_review → needs_information` operation;
- bounded requested-action and public-message text;
- strict versioned information-request event envelope;
- durable replay and changed-content UUID conflict behavior;
- private status projection of only strict parsed request text;
- suppression of old request text outside `needs_information`;
- protected reviewer information-request form;
- no submitter response intake, hold, duplicate decision, Candidate creation, canonical mutation, export, or publication.

P5-02G established:

- an exact-state guarded `in_review → on_hold` operation;
- bounded 30/60/90 day next-review timing;
- durable replay, Audit, and private-status behavior;
- no automatic state change when the next-review date arrives.

P5-02H established:

- an exact-state guarded `in_review → resolved / accepted_as_candidate` outcome;
- separate Candidate-create authorization and configured `user_submission` source validation;
- atomic private Source Record, Candidate, origin linkage, Submission resolution, and durable event persistence;
- deterministic replay and normalized-payload version guards;
- no canonical mutation, export, or publication.

P5-02I established:

- explicit server-only environment binding for the existing deterministic status-secret HMAC provider;
- strict canonical Base64URL decoding and minimum key-length enforcement;
- bounded configuration failures without configured-value disclosure;
- no public route exposure.

P5-02J established:

- production-capable AES-GCM contact encryption with randomized ciphertext;
- separate keyed normalized-email HMAC hashing;
- explicit key identity and configured retention date derivation;
- bounded configuration and operation failures without secret or plaintext email disclosure;
- no public route exposure.

P5-02K established:

- explicit server-only HMAC binding for opaque rate-limit bucket derivation;
- versioned domain-separated HMAC-SHA-256 derivation;
- deterministic `rl_<opaque>` output accepted by the existing abuse-control contract;
- no raw edge identity in output and no public route exposure.

P5-02L established:

- direct incoming Pages Function request boundary for `CF-Connecting-IP` only;
- strict IPv4 and IPv6 validation and normalization;
- fail-closed handling with no forwarded-header fallback;
- no raw identity persistence or public route exposure.

P5-02M established:

- a SQLite-backed Durable Object distributed fixed-window provider behind the existing `SubmissionRateLimiter` interface;
- deterministic mapping from opaque rate-limit bucket keys to Durable Object identities;
- fail-closed provider, malformed-response, invalid persisted-state, and clock-rollback handling;
- Wrangler dry-run bundle validation through the repository schema-check CI path;
- no raw identity in the provider contract and no public route exposure.

P5-02N established:

- explicit Turnstile server/browser environment binding;
- one shared action value for widget configuration and server verification;
- exact configured hostname/action enforcement through the existing Siteverify adapter;
- client-safe configuration separation from the server secret;
- bounded configuration failure behavior without configured-value disclosure;
- no public route exposure.

P5-02O established:

- the `POST /api/suggest` Pages Function route;
- strict HTTP envelope, UUID idempotency key, and streamed body-byte limits;
- complete environment-backed DB, status-secret, contact-protection, opaque-bucket, Durable Object limiter, Turnstile, and private Suggest intake composition;
- trusted edge identity to opaque bucket handoff;
- bounded 202/400/409/413/415/429/503 response mapping;
- bounded `Retry-After` behavior;
- no browser form UI or canonical/public mutation.

P5-02P now establishes the public `/contribute` and `/suggest` browser surfaces, a strict browser payload builder that reuses the existing Suggest schema, explicit Turnstile rendering, browser POST orchestration and private receipt rendering, bounded public error presentation, `/suggest`-scoped Turnstile CSP, and build-artifact leakage checks.

The active P5-02 work must continue configured-environment verification of the complete Suggest route path. P5-02 then closes with a bounded integration and handoff audit before P5-03 begins.

### P5-03 — Payment and problem reports

Add target-aware positive and negative payment reports plus factual, privacy, rights, duplicate, and other problem reports. Reports create review material and may trigger recheck priority; they do not automatically change Claim state.

### P5-04 — Business and service claims

Add claimant intake and ownership-verification workflow boundaries. Ownership verification does not bypass payment Evidence review or publication validation.

### P5-05 — Photo and Media submission intake

Add upload intake, quarantine, file validation, privacy and rights acknowledgements, and handoff to the existing protected Media review boundary. Original submissions remain non-public.

### P5-06 — Review workflow extensions

Add reviewer diffs, information requests, time-bounded holds, partial approval, duplicate/no-change handling, and private status communication required by real Submission review.

### P5-07 — Canonical application transactions and retention

Apply approved field decisions through explicit guarded canonical transactions, preserve correction provenance and Audit history, run normal export/publication validation, and enforce private Submission retention and deletion rules.

### P5-08 — MVP-B integration audit

Verify each Submission type from public intake through private status, protected review, decision, canonical application where approved, public export, publication state, privacy boundaries, failure handling, and retention behavior.

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
