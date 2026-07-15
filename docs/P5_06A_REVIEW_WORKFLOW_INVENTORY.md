# P5-06A cross-submission review workflow inventory

**Implementation item:** P5-06A  
**Status:** In progress  
**Last updated:** 2026-07-15

## Purpose

P5-06A audits the completed Phase 5 submission families against the public Submission workflow contract before adding another reviewer mutation surface.

The inventory covers:

- Suggest Place and Online Service;
- Payment and problem reports;
- Business and service Claims;
- Photos and their protected Media handoff;
- the common private status path.

Repository `main`, merged pull requests, schemas, and executable checks are authoritative. This inventory does not infer completion from the product policy alone.

## Required common workflow

The public workflow contract requires these reusable capabilities where they apply:

```text
received → triage → in_review → resolved
in_review → needs_information → in_review
in_review → on_hold → in_review
```

It also defines bounded terminal outcomes and reviewer operations for:

- approval and partial approval;
- accepted-as-Candidate;
- not approved;
- duplicate;
- no change;
- withdrawal;
- field-level approve, reject, and hold;
- temporary visibility restriction;
- private status projection.

Canonical application and public export remain later boundaries. P5-06 must close review workflow gaps without silently moving P5-07 canonical work earlier.

## Shared foundation already complete

The common P5-01 foundation provides:

- private intake with `received` as the initial workflow status;
- immutable original payload plus review-safe normalized payload;
- opaque public reference and status-secret separation;
- durable workflow events and Audit history;
- exact replay and changed-content conflict handling;
- private status lookup;
- protected contact storage;
- no automatic canonical or public mutation.

The private status backend already knows how to project the latest strict information-request and hold event while the Submission remains in the corresponding state. The missing work is therefore primarily reviewer reachability and type coverage, not another status-secret system.

## Capability inventory

| Capability | Suggest | Payment / problem reports | Business Claim | Photos / Media |
|---|---|---|---|---|
| Private intake starts at `received` | Yes | Yes | Yes | Yes |
| Protected Submission queue and detail | Yes, #159 | Yes, #197 | Yes, #209 | No parent-Submission workspace; protected Media workspace exists through P3-10 |
| `received → triage → in_review` | Yes, #160 | No report-specific or common reachable transition identified | Yes, #210 | No parent-Submission transition identified |
| Request information | Yes, #161 | No | Yes, #210 | No |
| Resume from `needs_information` | Not completed in the Suggest sequence | No | Yes, #210 | No |
| Time-bounded hold | Yes, #162 | No | Yes, #210 | No |
| Resume from `on_hold` | Not completed in the Suggest sequence | No | Yes, #210 | No |
| Accepted as private Candidate | Yes, #163 | Not a normal report outcome | Not applicable | Not applicable |
| Positive / negative Evidence decision | Not in Suggest review | Yes, #198–#199 | Verification result recording, #211 | Gallery candidates are not Evidence by default |
| Duplicate / no-change decision | Explicitly left out of P5-02H | Yes, #200 | No common terminal decision identified | Exact-hash signals only; no automatic or parent-Submission decision, #221 |
| Typed correction or canonical proposal handoff | Candidate outcome only | Yes, #200 | Yes, field projection and durable application, #213–#215 | Media handoff only, #220 |
| Field-level accept / reject | Not completed | Typed report-specific decisions, not a common field matrix | Yes, #213–#215 | Media Asset decision exists through P3-10, not parent-Submission resolution |
| Temporary urgent hiding | No | Yes, #200 | No | Media restriction/revocation exists through P3-10 |
| Not-approved terminal outcome | No completed generic Suggest operation | Some report-specific terminal decisions exist | Relationship and field decisions exist, but no common terminal Submission operation | Media rejection exists, but parent Photos Submission is not synchronized |
| Withdrawal | No public or protected common operation identified | No | No | No |
| Private status projection | Common read plus Suggest request/hold details | Common read; report-specific result events are type-specific | Common read plus Claim transition events | Common read only; Media outcome is not projected as parent Photos resolution |

## Confirmed gaps

### G1 — Report decisions are not safely reachable from normal intake

All public intake creates a Submission in `received`.

P5-03 decision services require reviewed state, but the P5-03 sequence contains no protected report transition equivalent to Suggest #160 or Claim #210. A report can therefore be accepted publicly and displayed in the protected queue while its decision paths remain unreachable without an out-of-band database change.

This is the first implementation priority.

### G2 — Photos have Media review but no parent Submission review lifecycle

P5-05 completes upload, validation, processing, and protected Media handoff. P3-10 provides Media queue, detail, approval, rejection, restriction, and publication storage operations.

The parent `photos` Submission still lacks:

- a protected Submission workspace;
- begin-triage and begin-review operations;
- request-information and hold operations;
- synchronization from all child Media decisions to one parent resolution;
- private status projection of the final Photos outcome.

Media approval must not be treated as automatic parent resolution until all submitted items have explicit decisions.

### G3 — Suggest cannot resume or close through all defined outcomes

Suggest supports begin triage, begin review, request information, hold, and accepted-as-Candidate.

The completed sequence does not provide:

- `needs_information → in_review`;
- `on_hold → in_review`;
- duplicate;
- no change;
- not approved;
- withdrawal.

The existing information-request and hold event formats should be reused rather than replaced.

### G4 — Common terminal outcomes are fragmented by submission type

Reports contain strong typed terminal decisions. Claims contain verification and field-application decisions. Media contains asset-level decisions. Suggest contains accepted-as-Candidate.

There is no single protected terminal-resolution contract for the remaining ordinary outcomes. P5-06 must not erase type-specific evidence, verification, correction, or Media semantics; it should add only the missing common closure layer around them.

### G5 — Partial resolution is not consistently projected to the submitter

Claim field application is field-level. Media decisions are asset-level. Report corrections can be typed. However, the parent Submission private status does not yet consistently distinguish:

- fully approved;
- partially approved;
- no change;
- not approved;
- duplicate;
- still waiting on held items.

P5-06 should establish resolution projection. P5-07 remains responsible for canonical application transactions and retention.

## Decisions

P5-06 will proceed in bounded slices.

### P5-06B — Common review entry for reports and Photos

Add protected, exact-state guarded:

```text
received → triage
triage → in_review
```

for `payment_report`, `problem_report`, and `photos`.

Requirements:

- reuse the P5-01 atomic transition persistence and Audit boundary;
- preserve existing Suggest and Claim services;
- use separate exact-subject authorization;
- expose bounded controls in the existing report reviewer workspace and a new Photos parent workspace;
- add no final decisions or canonical mutation.

### P5-06C — Information, hold, and resume coverage

Add reusable exact-state operations for:

```text
in_review → needs_information
needs_information → in_review
in_review → on_hold
on_hold → in_review
```

Apply them to Suggest, reports, and Photos while preserving Claim #210 behavior.

Requirements:

- reuse strict event payloads and private status projection;
- keep hold reason and reviewer identity private;
- require 30/60/90-day next-review timing;
- add no automatic transition when a date arrives.

### P5-06D — Common terminal resolution

Add bounded terminal outcomes only where a type-specific decision has not already resolved the Submission:

- `not_approved`;
- `duplicate`;
- `no_change`;
- `withdrawn`.

Requirements:

- preserve report-specific duplicate and no-change semantics from #200;
- require exact referenced duplicate target where applicable;
- never delete useful Evidence or Media automatically;
- project only public-safe resolution text.

### P5-06E — Photos parent resolution and partial outcomes

Synchronize child Media decisions into the parent Photos Submission.

Requirements:

- all submitted Media items must have durable decisions before full resolution;
- mixed accepted and rejected items produce `partially_approved`;
- all rejected items produce `not_approved`;
- no Media decision automatically changes canonical or public data outside the existing P3-10 storage/publication boundary;
- private status reveals decisions without storage keys, reviewer identity, or private proof.

### P5-06F — Cross-submission integration audit

Verify:

- every public submission family can reach protected review from `received`;
- information and hold loops are reachable and replay-safe;
- terminal outcomes are type-correct;
- private status projection is complete and leakage-safe;
- no P5-06 operation performs P5-07 canonical application or export work.

## Explicit exclusions

P5-06A adds no runtime mutation, migration, protected endpoint, UI control, canonical change, Media approval, export activation, publication, deployment, or launch claim.

## Completion condition

P5-06A is complete when this inventory is merged and `PROJECT_STATUS.md` points to P5-06B as the next bounded implementation item.
