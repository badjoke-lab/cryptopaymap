# P6-01 — Launch evidence register and data QA baseline

## Decision

Phase 6 begins with an evidence control plane. Repository-complete work is necessary but cannot by itself satisfy a configured launch gate.

Every launch item has one current proof state:

- `unproven`
- `blocked`
- `failed`
- `expired`
- `passed`

`passed` requires an executed procedure and retained artifact. Documentation presence, implementation presence, or a previously successful unrelated workflow is insufficient.

## Required evidence metadata

Each receipt records:

- evidence id;
- launch domain;
- owner;
- environment;
- procedure or command;
- source revision;
- artifact location and digest;
- execution timestamp;
- result;
- exceptions;
- expiry or recheck rule.

## Evidence environments

- Repository-executable
- Configured staging
- Configured production
- Manual device
- Operational drill

Evidence from one environment does not silently satisfy another.

## Launch evidence register

| Domain | Initial owner | Required environment | Initial state | Blocking rule |
| --- | --- | --- | --- | --- |
| Data QA | Data operations | Repository-executable plus configured production | unproven | Any orphan, projection leak, count mismatch, or false publication state blocks launch |
| Legacy export | Migration operations | Configured production | unproven | Missing complete immutable export blocks migration |
| Migration audit | Migration operations | Configured staging and production | unproven | Unmapped or silently promoted legacy records block cutover |
| License audit | Data governance | Repository-executable plus manual review | unproven | Missing provenance, rights basis, or attribution blocks affected records |
| Privacy audit | Privacy operations | Configured staging and production | unproven | Secret leakage, retention mismatch, or unreceipted deletion blocks launch |
| Mobile QA | Product QA | Manual device | unproven | Critical discovery or contribution flow failure blocks launch |
| Accessibility QA | Accessibility owner | Repository-executable plus manual assistive technology | unproven | Critical WCAG 2.2 AA flow defect blocks launch |
| Performance QA | Performance owner | Configured production-like environment | unproven | Severe interaction or loading failure blocks launch |
| Security QA | Security owner | Configured staging and production | unproven | High-severity unresolved defect blocks launch |
| Redirects | Migration operations | Configured staging and production | unproven | Broken high-value legacy mapping blocks cutover |
| Sitemap and robots | Release operations | Configured production | unproven | Candidate/private URLs or invalid canonical indexing blocks launch |
| Domain cutover | Release lead | Operational drill and configured production | blocked | Cannot pass before all prerequisite gates pass |
| Backup | Database operations | Configured production | unproven | Missing verified backup blocks launch |
| Rollback | Release lead | Operational drill | unproven | Unproven rollback blocks cutover |
| Monitoring | Operations | Configured production | unproven | Missing failure detection and escalation blocks launch |

## Initial data QA baseline

The first data QA execution must prove:

1. Canonical integrity: no orphan public entities, locations, claims, evidence, assets, networks, routes, methods, or media.
2. Public projection integrity: allowlisted fields only; private fields fail validation; manifests, versions, counts, Stats, and Updates agree.
3. Provenance and license integrity: public records and media retain source identity, rights basis, and required attribution.
4. Migration integrity: legacy identities and decisions are auditable; imported candidates remain private until reviewed.
5. Candidate exclusion: candidates do not appear in map pins, search, generated pages, Stats, Updates, or public exports.
6. Publication-state consistency: canonical application, export validation, release, and public visibility remain separately receipted; no false public state is permitted.

## Phase 5 preservation

P5-08A through P5-08F remain fixed repository evidence. P6-01 does not weaken or replace them.

## Boundary

This document does not prove production deployment, configured identity, live database execution, object-store behavior, domain ownership, DNS readiness, release activation, retention deletion, rollback success, or launch readiness.

## Next owner

P6-02 owns configured identity-aware access, deployed capability allowlists, and protected Admin journey evidence.