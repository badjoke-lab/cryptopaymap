# P4-18B3 canonical persistence and public projection audit

**Implementation item:** P4-18B3  
**Status:** Active — B3A merged, B3B in progress  
**Last updated:** 2026-07-08

## Purpose

P4-18B3 verifies the new-target practical Place create path from reviewed Promotion values through atomic canonical persistence, field provenance, public projection validation, staging coverage, and all required public Place surfaces.

This audit is bounded to the new-target create path. Existing-record correction transactions remain P4-18B4.

## Required check matrix

| Closure requirement | Repository evidence | Status |
|---|---|---|
| Atomic persistence | Candidate Promotion Drizzle backend writes Entity, Location, Claim, Claim Assets, provenance, mapping, Candidate state, and decision in one database batch; practical rollback coverage is merged through #132 | Repository covered |
| Replay and conflict behavior | request fingerprint replay and conflict guards plus practical-content replay/conflict coverage are merged through #132 | Repository covered |
| Field provenance rows | Drizzle backend expands field assignments into durable rows; practical assignment and expansion coverage is merged through #132 | Repository covered |
| Public allowlisting | explicit `projectCanonicalPlace` allowlists canonical Entity and Location values into strict public Place records | Repository covered through #132 |
| Strict schema validation | canonical inputs and projected Place records pass strict runtime schemas | Repository covered through #132 |
| Leakage rejection | projection excludes unlisted canonical extras and public export validation remains active | Repository covered through #132 |
| Absence semantics | optional practical fields remain absent instead of becoming invented negative facts | Repository covered through #132 |
| Staging artifact coverage | fixture and built Place detail checks exercise description, hours, amenities, phone, social link, and Media | Repository covered through #132 |
| Desktop selected panel | consumes practical public fields and retains focused component coverage | Existing repository coverage |
| Mobile expanded sheet | consumes practical public fields and retains focused component coverage | Existing repository coverage |
| Canonical Place detail | practical profile section and staging artifact assertions are merged through #132 | Repository covered through #132 |
| Public provenance metadata | B3B adds a fail-closed builder from resolved source metadata plus field-level provenance rows to public Place provenance entries | B3B active |
| Promotion-to-public integration | B3B covers Promotion-preserved canonical values, hidden-state rejection, explicit public projection, provenance aggregation, and Place artifact validation | B3B active |

## B3A result — merged through #132

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

## B3B — Projection integration and boundary audit

### Confirmed repository boundary

The repository release-review path begins from an already generated private export candidate bundle. The release workspace loads that private candidate, revalidates the complete artifact set, summarizes the exact artifacts, and pins decisions to a snapshot digest.

The existing release workspace specification explicitly excluded artifact generation and upload from P3-11C. The general public export boundary also states that P2-12 does not provide database queries that construct projections.

Therefore B3B must not pretend that a repository-owned full canonical database → twelve-artifact private candidate generator already exists.

### B3B repository work

B3B adds the strongest repository-level integration available at the practical Place boundary:

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

### External and live boundary to carry forward

P4-18E must verify the configured environment-specific path that actually:

- queries canonical data for candidate generation;
- resolves source, source-record, license, and attribution metadata;
- constructs the complete twelve-artifact candidate set;
- writes the private candidate bundle to the configured source used by release review;
- preserves practical Place fields and their public provenance metadata;
- allows the release workspace to revalidate and pin the intended snapshot.

If that generator/upload path does not exist in the configured environment, P4-18E must record it as an explicit launch blocker or assign implementation to the appropriate launch item. Repository tests must not be labeled as live verification.

## B3C — B3 closure audit

B3C must:

- run and reconcile the complete repository validation set;
- verify the matrix above against merged code and tests;
- distinguish repository-complete checks from the environment-specific generator/upload path assigned above;
- record remaining live checks for P4-18E;
- move tracking to P4-18B4 only after repository B3 requirements are closed.

## Non-goals

- existing-record practical-profile correction transactions;
- public submission intake;
- UI residual redesign outside the canonical Place detail practical-profile parity required by B3;
- live database or production publication claims from repository tests alone.
