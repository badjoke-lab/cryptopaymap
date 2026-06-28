# CryptoPayMap Phase 2 completion audit

## Purpose

This audit verifies that the repository-level Data core is complete before Phase 3 administration and review work begins.

Phase 2 establishes data contracts and fail-closed boundaries. It does not provide an administration interface, perform production database writes, or publish imported candidates.

## Completed implementation items

| Item | Result |
|---|---|
| P2-01 Asset registry | Stable asset identities and aliases |
| P2-02 Network registry | Explicit network identities without asset inference |
| P2-03 Payment method and route registries | Route and method remain separate concepts |
| P2-04 Entity and location schema | Brand, service, and physical location boundaries |
| P2-05 Acceptance claim schema | Candidate, Confirmed, Stale, Ended, and Rejected contracts |
| P2-06 Claim asset and network combinations | Explicit asset, network, and payment-method combinations |
| P2-07 Evidence schema | Source capture and public/private Evidence boundaries |
| P2-08 Verification event history | Auditable claim-state history |
| P2-09 Source candidates and provenance | Private candidates, immutable observations, licenses, and duplicate boundaries |
| P2-10 Media and legacy identifiers | Media eligibility, rights metadata, and migration identities |
| P2-11 Public export schemas | Twelve explicit JSON and GeoJSON contracts |
| P2-12 Export validator | Exact allowlist, recursive leakage detection, hashes, counts, and release consistency |
| P2-13 Physical importer | Deterministic private physical-place candidate plans |
| P2-14 Online importer and integration | Deterministic online candidate plans and complete boundary proof |

## Candidate and canonical separation

The physical and online importers produce only private source-layer plans:

- `candidate_status = new`;
- canonical entity ID is null;
- canonical location ID is null;
- legacy mapping is pending;
- raw and normalized source values remain traceable;
- no acceptance claim is produced;
- no verification event is produced;
- no public artifact is produced;
- automatic Confirmed count is zero.

Canonical persistence and promotion require Phase 3 review actions.

## Twenty-record integration proof

The automated integration audit creates:

```text
10 physical-place candidate drafts
10 online-service candidate drafts
```

It verifies:

- all twenty remain private candidates;
- all twenty retain pending legacy mappings;
- none has a canonical target;
- neither importer creates a Confirmed claim;
- Candidate and raw-payload fields are detected by recursive leakage inspection;
- importer plans fail public artifact schema validation;
- the public artifact allowlist remains exactly twelve paths.

The proof uses synthetic records and does not require production credentials or legacy database access.

## Public export boundary

Public release eligibility requires all of the following:

- path is in the exact allowlist;
- the complete artifact set is present;
- each artifact passes its strict schema;
- no Candidate, private, contact, review, submission, storage, or raw-payload field leaks;
- generated times and schema versions agree;
- manifest media types and record counts agree;
- canonical SHA-256 digests agree;
- the validated release set is immutable.

Validation failure does not produce a publishable release set.

## Provenance and identity

Both importers preserve:

- source ID;
- optional license ID;
- import batch ID;
- importer version;
- fetched and observed times;
- original source row;
- normalized review row;
- SHA-256 content hash;
- stable candidate identity;
- stable source-record identity;
- stable pending legacy mapping identity.

Exact replay and conflicting legacy identity behavior are covered by automated tests.

## Duplicate handling

Signals never perform an automatic merge.

Physical signals:

- shared OSM identity;
- same normalized name and coordinates.

Online signals:

- shared official domain;
- same normalized name within a candidate type.

A reviewer must decide identity and merge behavior in Phase 3.

## Scope exclusion

The online importer excludes these types from the main candidate directory:

- crypto cards;
- gift cards;
- bill-payment intermediaries;
- exchanges;
- ATMs.

This preserves the distinction between direct merchant or service acceptance and indirect spending or conversion routes.

## Migration and database review

Phase 2 migrations are represented as reviewable SQL plus Drizzle snapshots and journal history. Migration drift validation is required on every pull request.

The importers currently create plans rather than database writes. Transactional persistence, rollback behavior for review actions, and canonical promotion are Phase 3 responsibilities.

## Automated validation

Phase 2 completion requires green results for:

- canonical formatting;
- lint;
- Astro and TypeScript checks;
- runtime schema checks;
- physical importer proof;
- online importer proof;
- twenty-record integration audit;
- migration history checks;
- migration drift;
- unit and component tests;
- static build;
- accessibility foundation;
- staging artifact checks.

## Phase 2 completion criteria

| Criterion | Result |
|---|---|
| Candidate and canonical records are structurally separate | Passed |
| Reviewable migration history exists | Passed |
| Verification states and history are auditable | Passed |
| Only eligible records can enter validated exports | Passed |
| Source and license metadata remain traceable | Passed |
| Ten physical and ten online test imports succeed | Passed |
| Test imports create no automatic Confirmed records | Passed |
| Private importer plans are rejected by public schemas | Passed |

## Deferred live verification

Cloudflare live staging verification remains separately deferred. It does not change the repository-level Phase 2 result because the Data core and generated static artifact checks require no live infrastructure access.

## Phase 3 handoff

Phase 3 must add:

- protected administration shell;
- candidate queue and detail;
- database persistence and idempotent transactions;
- canonical entity and location creation;
- claim editing;
- asset, network, route, and payment-method resolution;
- Evidence review;
- duplicate decisions and merge safeguards;
- Candidate-to-canonical promotion;
- Confirmed, Stale, and Ended transitions;
- recheck queue;
- media review;
- export controls;
- audit history.

Phase 3 must preserve every fail-closed boundary established in Phase 2.
