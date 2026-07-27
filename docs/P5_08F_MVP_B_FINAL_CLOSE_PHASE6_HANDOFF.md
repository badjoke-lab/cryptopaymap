# P5-08F — MVP-B final close and Phase 6 evidence handoff

## Decision

Phase 5 is repository-complete when the retained P5-08A through P5-08E audits all pass together and no repository artifact claims configured-production proof that has not been collected.

## End-to-end family coverage

The five Submission families remain covered across public intake, opaque private status, protected review, final decision, canonical application, retention, and publication handoff:

- Suggest
- Payment Report
- Problem Report
- Business Claim
- Photos

The retained audits remain authoritative:

- P5-08A: integration matrix and repository handoff
- P5-08B: public intake and private status
- P5-08C: protected review and final decision
- P5-08D: canonical application and publication handoff
- P5-08E: privacy, retention, replay, conflict, and partial failure

## Phase 5 close criteria

Phase 5 closes only when:

1. all five retained audit documents, executable checkers, and dedicated workflows are present;
2. normal Foundation validation and Migration drift pass;
3. all retained P5-08 workflows pass on the same final head;
4. canonical application remains separate from export, release, activation, publication, and public-state mutation;
5. retention registration remains separate from configured scheduler execution and deletion proof;
6. no live database, object store, Access policy, deployment, DNS, release, or deletion claim is made.

## Phase 6 evidence owners

Phase 6 must collect configured-production evidence for:

| Evidence area | Required proof |
| --- | --- |
| Cloudflare Access | deployed policy, reviewer/admin identity enforcement, denied unauthorized journey |
| Capability allowlists | configured subjects, role/capability binding, denial evidence |
| Admin journeys | deployed queue/detail/workspace/final-decision/application flows |
| Neon | live transaction boundaries, durable decision/application receipts, rollback evidence |
| R2 and Media | upload, quarantine, accepted object, rejected object, retention, deletion receipts |
| Export/release | generated export, release registration, activation, history, restore, reconciliation |
| Publication | canonical-to-public reconciliation and published-with-release invariant |
| Retention | scheduler binding, eligibility selection, hold/suppression behavior, deletion execution |
| Failure recovery | partial-failure retry, replay, conflict, rollback, restore drills |
| Privacy | production secret isolation, private/public payload verification, deletion provenance preservation |

## Phase 6 entry criteria

Phase 6 may begin from the merged P5-08F main only. Every production exercise must name its environment, fixed commit, configured dependency, execution time, durable receipt, failure interpretation, and rollback or restore path.

## Explicit non-claims

This close does not prove production deployment, launch readiness, live data mutation, export activation, publication, deletion, DNS cutover, or operational restore capability.
