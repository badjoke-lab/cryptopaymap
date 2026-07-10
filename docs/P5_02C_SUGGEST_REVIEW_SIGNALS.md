# P5-02C Suggest review signals

**Implementation item:** P5-02C  
**Status:** Active  
**Last updated:** 2026-07-10

## Purpose

P5-02C adds bounded read-only review signals for a normalized Suggest submission before protected reviewer entry.

The slice detects two separate classes of possible overlap:

```text
Suggest
├─ possible duplicate private Candidate
└─ possible existing canonical target
```

Signals are review material only. P5-02C does not confirm a duplicate, dismiss a signal, link a Candidate, create a Candidate, select a canonical target, mutate canonical data, export data, or publish anything.

## 1. Existing decision boundaries remain authoritative

CryptoPayMap already has:

- Candidate duplicate review and explicit duplicate decisions;
- canonical target search;
- protected target selection;
- existing-target linking persistence;
- guarded Promotion integration.

P5-02C does not duplicate those decision systems.

It adds only a pre-review signal layer for Suggest submissions and reuses existing vocabulary and target contracts where possible.

## 2. Candidate signal reasons

Candidate overlap uses the existing duplicate-signal reason vocabulary.

For physical Place Suggests, the current Suggest contract can generate:

```text
same_name_and_coordinates
strength: review
```

The existing `shared_osm_identity` reason remains valid for imported Candidate data, but P5-02C does not fabricate it because the current public Suggest contract does not collect OSM identity.

For Online Service Suggests, P5-02C can generate:

```text
shared_official_domain
strength: strong
```

and:

```text
same_normalized_name
strength: review
```

A single Candidate may carry more than one reason.

## 3. Candidate search backend

The Drizzle Suggest Candidate signal backend performs bounded read-only search over existing private Candidate and source-provenance data.

Candidate eligibility for signal search is limited to:

```text
new
triaged
linked
duplicate
```

Promoted records are handled through canonical target search instead of Candidate overlap signals. Rejected and archived Candidates are not surfaced by this bounded search.

Search inputs are:

```text
candidate type
normalized name
official domain when available
bounded limit
```

The backend:

1. queries exact normalized-name Candidate matches;
2. for Online Service Suggests, also queries bounded source records that may contain the official domain;
3. deduplicates Candidate IDs;
4. loads bounded source records for those Candidate IDs;
5. projects only existing allowlisted Candidate source snapshots;
6. returns signal material for exact reason evaluation in the service layer.

SQL domain matching is candidate retrieval only. The final `shared_official_domain` reason is emitted only after exact normalized hostname comparison in application logic.

## 4. Physical Candidate coordinate rule

A physical Candidate signal is emitted only when:

```text
normalized Suggest entity name
=
Candidate normalized name
```

and one Candidate physical source snapshot has latitude and longitude equal to the Suggest coordinate pair at six decimal places.

This mirrors the existing physical import duplicate reason shape.

If the Suggest has no coordinates, P5-02C does not fabricate a physical Candidate duplicate reason from name alone.

## 5. Existing canonical target search

P5-02C reuses the existing `CandidateCanonicalTargetSearchBackend` result contract rather than inventing a second canonical target representation.

The Suggest service derives at most three bounded search queries.

Physical Place:

```text
entity name
address line when present
locality when present
```

Online Service:

```text
entity name
official domain
```

Each query uses the existing canonical target search backend with a bounded per-query limit. Results are deduplicated by canonical path.

## 6. Canonical target signal reasons

P5-02C attaches bounded reasons to returned canonical target options:

```text
same_normalized_name
shared_official_domain
same_address
near_coordinates
```

`shared_official_domain` produces a strong signal.

The other reasons are review signals.

Near-coordinate comparison currently uses a 100-meter radius after a target has already been returned by bounded identity/address/locality search. It is not a global geospatial radius scan.

## 7. Bounded coverage and absence semantics

Signal generation returns explicit coverage metadata:

```text
candidateSearchComplete
canonicalSearchComplete
absenceIsConclusive: false
```

`complete` means the configured bounded backend calls completed successfully. It does not mean every possible duplicate or existing target in the whole database was exhaustively ruled out.

Therefore:

```text
candidateSignals = []
canonicalTargetSignals = []
```

means:

```text
no bounded signal was found
```

not:

```text
this Suggest is definitely unique
```

The protected reviewer must still make the actual duplicate/target decision through the existing review systems.

## 8. Failure behavior

Candidate signal search and canonical target search are generated together.

If either backend fails, P5-02C fails closed with:

```text
backend_failure
```

It does not present partial signal coverage as a complete successful result.

Backend output is validated through a strict bounded response schema. Invalid output fails with:

```text
invalid_response
```

## 9. No automatic mutation

P5-02C does not perform:

```text
signal → duplicate decision
signal → Candidate group creation
signal → Candidate creation
signal → existing-target link
signal → target selection
signal → canonical mutation
signal → Claim mutation
signal → export
signal → publication
```

Later protected reviewer work must explicitly choose the next operation.

## 10. Test coverage

P5-02C verifies:

1. Online Service official-domain strong Candidate signal;
2. Online Service normalized-name review Candidate signal;
3. physical same-name-and-coordinate Candidate review signal;
4. canonical same-name and official-domain reasons;
5. physical same-address and near-coordinate reasons;
6. bounded search-query derivation;
7. zero-signal response with `absenceIsConclusive = false`;
8. fail-closed backend failure behavior;
9. schema-check integration.

The Drizzle backend is also type-checked against current Candidate/source-provenance schema and reuses the existing Candidate source snapshot projector.

## 11. Out of scope

P5-02C does not add:

- public Suggest route or form;
- Candidate creation transaction;
- duplicate group creation from a Suggest;
- duplicate decision action;
- existing-target selection action;
- existing-target linking mutation;
- reviewer queue/detail UI;
- global fuzzy matching service;
- exhaustive geospatial search;
- canonical mutation;
- Evidence acceptance;
- export or publication.

## 12. Completion criteria

P5-02C is complete when:

1. Suggest review signals distinguish Candidate overlap from canonical target overlap;
2. Candidate reasons reuse existing duplicate-signal vocabulary;
3. canonical results reuse the existing target option contract;
4. signal generation is bounded and read-only;
5. exact domain comparison occurs after bounded retrieval;
6. zero results are explicitly non-conclusive;
7. backend failure does not return partial success;
8. focused tests and schema checks are green;
9. full repository validation is green;
10. no automatic decision or mutation is introduced.

## Next

After P5-02C merges green, proceed to the next bounded P5-02 slice for protected reviewer entry using the persisted Suggest projection and these read-only signals.
