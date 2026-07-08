# P4-18B3 canonical persistence and public projection audit

**Implementation item:** P4-18B3  
**Status:** Repository completed through #132 and #133; closure tracking through #134  
**Last updated:** 2026-07-08

## Purpose

P4-18B3 verifies the new-target practical Place create path from reviewed Promotion values through atomic canonical persistence, field provenance, public projection validation, staging coverage, and all required public Place surfaces.

This audit is bounded to the new-target create path. Existing-record correction transactions remain P4-18B4.

## Closure result

Repository B3 requirements are complete through #132 and #133, with closure tracking and B4 handoff recorded by #134.

The repository now covers:

- atomic practical-profile Promotion persistence and rollback behavior;
- identical replay and changed-content conflict behavior;
- field-level practical-profile provenance assignment and durable row expansion;
- explicit allowlisted canonical Place projection;
- strict canonical and public schema validation;
- private-extra-field exclusion and leakage checks;
- optional-field absence semantics;
- malformed structured social-link rejection;
- public Place provenance aggregation from resolved source metadata and field-level provenance rows;
- Promotion-preserved practical values through hidden canonical state, hidden-state projection rejection, explicit public state, provenance aggregation, public Place projection, and Place artifact validation;
- canonical Place practical-profile presentation;
- desktop selected-panel and mobile expanded-sheet consumption of public practical profile fields;
- built staging Place detail coverage for description, hours, amenities, phone, official social link, and Media.

B3 repository completion does not claim that a live canonical database, full candidate generator, private object upload, release approval, or publication activation has been verified.

## Required check matrix

| Closure requirement | Repository evidence | Final status |
|---|---|---|
| Atomic persistence | Candidate Promotion Drizzle backend writes Entity, Location, Claim, Claim Assets, provenance, mapping, Candidate state, and decision in one database batch; practical rollback coverage merged through #132 | Repository covered |
| Replay and conflict behavior | request fingerprint replay and conflict guards plus practical-content replay/conflict coverage merged through #132 | Repository covered |
| Field provenance rows | Drizzle backend expands field assignments into durable rows; practical assignment and expansion coverage merged through #132 | Repository covered |
| Public allowlisting | explicit `projectCanonicalPlace` allowlists canonical Entity and Location values into strict public Place records | Repository covered through #132 |
| Strict schema validation | canonical inputs and projected Place records pass strict runtime schemas | Repository covered through #132 |
| Leakage rejection | projection excludes unlisted canonical extras and public export validation remains active | Repository covered through #132 and #133 |
| Absence semantics | optional practical fields remain absent instead of becoming invented negative facts | Repository covered through #132 |
| Staging artifact coverage | fixture and built Place detail checks exercise description, hours, amenities, phone, social link, and Media | Repository covered through #132 |
| Desktop selected panel | consumes practical public fields and retains focused component coverage | Existing repository coverage |
| Mobile expanded sheet | consumes practical public fields and retains focused component coverage | Existing repository coverage |
| Canonical Place detail | practical profile section and staging artifact assertions merged through #132 | Repository covered |
| Public provenance metadata | fail-closed builder from resolved source metadata plus field-level provenance rows to public Place provenance entries | Repository covered through #133 |
| Promotion-to-public integration | Promotion-preserved canonical values, hidden-state rejection, explicit public projection, provenance aggregation, and Place artifact validation | Repository covered through #133 |

## B3A result — #132

B3A established:

- normalized practical-field Promotion assignments and durable provenance expansion coverage;
- practical-field persistence, replay, changed-content conflict, and rollback regression tests;
- explicit allowlisted canonical Place projection;
- strict canonical and public schema validation;
- private-extra-field exclusion;
- optional-field absence semantics;
- malformed structured social-link rejection;
- canonical Place practical-profile presentation;
- built staging Place detail assertions for practical profile values.

B3A did not claim a live database-to-release generation pipeline.

## B3B result — #133

B3B established the strongest repository-level integration available at the practical Place boundary:

```text
reviewed Promotion input
    ↓
hidden canonical Entity and Location values
    ↓
field-level provenance assignments
    ↓
hidden-state public projection rejection
    ↓
explicit public canonical state
    ↓
public provenance aggregation from resolved source metadata
    ↓
allowlisted public Place projection
    ↓
strict Place artifact validation and leakage boundary
```

The integration test does not treat the explicit public-state test fixture as evidence that a live Claim transition or publication activation occurred. Those remain separate protected workflows.

## Confirmed release boundary

The repository release-review path begins from an already generated private export candidate bundle. The release workspace loads that private candidate, revalidates the complete artifact set, summarizes the exact artifacts, and pins decisions to a snapshot digest.

The existing release workspace specification explicitly excluded artifact generation and upload from P3-11C. The general public export boundary also states that P2-12 does not provide database queries that construct projections.

Therefore B3 does not claim that a repository-owned full canonical database → twelve-artifact private candidate generator exists.

## Environment-specific checks assigned to P4-18E

P4-18E must verify the configured environment-specific path that actually:

- queries canonical data for candidate generation;
- resolves source, source-record, license, and attribution metadata;
- constructs the complete twelve-artifact candidate set;
- writes the private candidate bundle to the configured source used by release review;
- preserves practical Place fields and their public provenance metadata;
- allows the release workspace to revalidate and pin the intended snapshot.

If that generator/upload path does not exist in the configured environment, P4-18E must record it as an explicit launch blocker or assign implementation to the appropriate launch item. Repository tests must not be labeled as live verification.

## B3C closure decision — #134

B3C concludes:

1. repository B3 requirements are closed through #132 and #133;
2. the environment-specific candidate-generation and private-upload path is precisely inventoried above and remains assigned to P4-18E;
3. repository tests must not be used to claim live database or publication verification;
4. the next implementation item is P4-18B4 existing-record practical-profile correction path audit and completion.

## Non-goals

- existing-record practical-profile correction transactions;
- public submission intake;
- UI residual redesign outside the canonical Place detail practical-profile parity required by B3;
- live database or production publication claims from repository tests alone.
