# Phase 3 cross-domain integration audit

**Implementation item:** P3-12F  
**Status:** Repository audit in progress

## Scope

This audit verifies the repository boundary established by P3-01 through P3-12E before Phase 4 public-core work begins.

The audited administration path is:

```text
private source candidate
→ protected candidate review
→ duplicate and identity resolution
→ canonical promotion or existing-target link
→ Evidence review and verification decision
→ Claim status transition and reconfirmation scheduling
→ Media review with private/public storage separation
→ validated private public-export candidate
→ reviewer release decision
→ controlled publication activation and release history
→ restore preparation and replay-safe restore workflow
→ normalized protected audit history across administration domains
```

## Administration boundaries

The repository keeps the following responsibilities separate:

- source candidates remain private until explicit reviewed promotion or linking
- duplicate decisions do not publish candidate data
- canonical promotion uses exact candidate and target guards
- Evidence review uses explicit decision receipts and verification events
- reconfirmation uses bounded queues and exact Claim guards
- Media review separates review authorization, rights/privacy decisions, and storage transitions
- export review and export publication use separate capabilities
- public release activation is tied to an exact approved snapshot
- audit history is read-only, metadata-only, bounded, protected, and sourced from durable Phase 3 tables

## Cross-domain audit history

P3-12 provides a normalized read boundary across:

- candidate decisions and promotions
- Evidence review decisions
- reconfirmation expirations
- Media review decisions
- export release decisions and activations

The repository check verifies:

- deterministic descending order across all five audit domains
- bounded result limits and `hasMore` behavior
- exact domain filtering
- target filtering across primary and secondary targets
- stable cursor continuation
- rejection of a context without `audit:read`
- rejection of source items that attempt to add private payload fields

Restore execution is represented in the normalized contract but remains excluded from the current Drizzle source registry until a corresponding durable table is implemented. This deferred source does not weaken the existing restore workflow checks or the five currently durable audit domains.

## Existing integration coverage

Phase 3 is also protected by dedicated repository checks for:

- candidate queue, detail, duplicate decisions, promotion persistence, promotion workspace, existing-target linking, target selection, provenance, field controls, and promotion integration
- Evidence review decision, persistence, workspace, and integration behavior
- reconfirmation contract, persistence, workspace, and scheduled-run behavior
- Media review decision and end-to-end storage-aware integration behavior
- export release contract, persistence, workspace, activation, activation history, release history, restore preparation, restore records, pointer switching, restore workflow, and release integration
- audit-history contract, aggregation, protected API route, administration UI component behavior, and built-artifact leakage checks

The full Foundation validation pipeline also runs formatting, linting, Astro and TypeScript checks, runtime schema checks, migration drift checks, unit and component tests, static build, accessibility validation, and staging-artifact validation.

## Deferred live verification

The repository audit does not claim completion of:

- live Cloudflare Access policy verification
- production actor allowlists
- live Neon migration execution
- live scheduled reconfirmation configuration
- concrete production R2 Media and export adapter wiring
- live R2 conditional-write and restore behavior
- production release and restore drills
- public serving of the validated export layer
- production monitoring and cutover checks

These remain deployment, launch, or later implementation tasks. They do not change the repository-level Phase 3 handoff boundary.

## Phase 4 handoff

After this audit is green and merged, Phase 3 is repository-complete with explicit live-verification deferrals. Phase 4 may begin the public-core / MVP-A implementation path.

Phase 4 must preserve the boundaries established here:

- public pages read only reviewed public data
- Candidate and private review data never appear as empty-state substitutes or public results
- Place and Online Service detail surfaces show the verified payment information required by the product specification
- map, list, filter, URL, and mobile-sheet state remain coordinated inside the public application boundary
- public media uses only approved public derivatives
- Stats and Updates derive from public canonical/exported data rather than private review queues
