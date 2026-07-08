# P4-18B3 canonical persistence and public projection audit

**Implementation item:** P4-18B3  
**Status:** Active  
**Last updated:** 2026-07-08

## Purpose

P4-18B3 verifies the new-target practical Place create path from reviewed Promotion values through atomic canonical persistence, field provenance, public projection validation, staging coverage, and all required public Place surfaces.

This audit is bounded to the new-target create path. Existing-record correction transactions remain P4-18B4.

## Required check matrix

| Closure requirement | Current repository evidence | B3 action |
|---|---|---|
| Atomic persistence | Candidate Promotion Drizzle backend writes Entity, Location, Claim, Claim Assets, provenance, mapping, Candidate state, and decision in one database batch | add practical-field regression coverage and preserve single-batch boundary |
| Replay and conflict behavior | request fingerprint replay and conflict guards already exist in service/backends | extend practical-field regression coverage |
| Field provenance rows | Drizzle backend expands field assignments into durable provenance rows | verify practical field assignments before backend commit and the durable expansion contract |
| Public allowlisting | strict `publicPlaceSchema` already includes practical fields | add explicit canonical-to-public Place projection helper that selects only public fields |
| Strict schema validation | public export schemas use strict Zod contracts | projection helper must parse through `publicPlaceSchema` |
| Leakage rejection | public export boundary recursively rejects operational keys and non-public URI schemes | projection tests must pass output through `validatePublicArtifact` and prove private extras are not projected |
| Absence semantics | optional practical public fields already allow omission | projection helper must omit unavailable optional sections rather than invent negative facts |
| Staging artifact coverage | staging fixture contains phone, description, hours, amenities, social link, and Media | staging artifact check must assert canonical Place detail exposes practical values |
| Desktop selected panel | already consumes practical public fields | retain existing component coverage |
| Mobile expanded sheet | already consumes practical public fields | retain existing component coverage |
| Canonical Place detail | payment, Evidence, freshness, and Media exist; practical profile presentation is incomplete | add practical profile sections and staging artifact assertions |

## Execution slices

### B3A — Practical create path and public Place projection

- verify normalized field-level Promotion assignments and durable provenance expansion behavior;
- add practical-field Promotion persistence, replay, conflict, rollback, and provenance regression tests;
- add explicit allowlisted canonical Place projection helper;
- validate projected Place output through strict public schema and export leakage boundary;
- add practical profile presentation to canonical Place detail;
- assert practical staging fixture values are present in the built Place detail artifact.

### B3B — Projection integration audit

- inspect the private export-candidate generation boundary and actual canonical query adapters;
- connect the explicit Place projection helper where a repository-owned canonical projection path exists;
- if artifact generation is intentionally external to this repository boundary, record that boundary precisely and add the strongest repository integration test available without fabricating a live database claim;
- verify practical provenance metadata joins or record the exact remaining environment-specific dependency.

### B3C — B3 closure audit

- run the complete repository validation set;
- reconcile the matrix above against merged code and tests;
- record any live-only checks for P4-18E rather than treating repository tests as live verification;
- move tracking to P4-18B4 only after all repository B3 requirements are closed.

## Non-goals

- existing-record practical-profile correction transactions;
- public submission intake;
- UI residual redesign outside the canonical Place detail practical-profile parity required by B3;
- live database or production publication claims from repository tests alone.
