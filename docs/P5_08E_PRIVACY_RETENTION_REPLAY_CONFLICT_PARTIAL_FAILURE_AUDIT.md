# P5-08E — Privacy, retention, replay, conflict, and partial-failure integration audit

## Fixed review boundary

This audit is repository evidence for Issue #272. It does not execute production deletion, mutate live Neon/R2 state, deploy a Worker or Pages build, activate an export, or claim Phase 6 configured-environment readiness.

## Cross-family result

Suggest, Payment Report, Problem Report, Business Claim, and Photos retain one common private Submission boundary from intake through review and canonical application. Public references remain opaque; follow-up secrets, reviewer notes, abuse-control material, capability subjects, internal receipts, upload metadata, and private object references do not become canonical or public fields.

| Submission family | Private boundary | Replay/conflict closure | Retention owner | Partial-failure closure |
| --- | --- | --- | --- | --- |
| Suggest | intake payload, follow-up secret, reviewer notes, target-selection workspace | same-content replay is deterministic; changed-content replay conflicts before a second Submission or Candidate mutation | common Submission retention plus Candidate receipt/provenance preservation | promotion/link failure cannot produce a canonical Candidate change without its durable application receipt |
| Payment Report | reporter payload, secret, reviewer-only Evidence workspace | stale/changed decisions fail before duplicate positive Evidence | common private retention; canonical Evidence provenance survives private deletion | decision and Evidence application remain separately receipted |
| Problem Report | reporter payload, secret, correction/recheck notes | duplicate, no-change, stale correction, and changed-content replay close without duplicate correction objects | private report retention; canonical correction/recheck provenance remains | failed correction, recheck, or replacement cannot leave an applied-without-receipt state |
| Business Claim | claimant payload, payment proof, capability subject, reviewer notes | relationship, field, and payment actions are exact-state and duplicate-safe | claim-private retention plus canonical relationship/field/payment provenance | transaction/plan/receipt boundaries prevent ambiguous partial application |
| Photos | uploader payload, secret, source upload metadata, private object references | child Media and parent resolution replay/conflict are separate | parent Submission, child Media, and object lifecycle owners remain distinct | failed child receipt or incomplete aggregate cannot resolve/publish the parent |

## Required invariants

1. Opaque public references and valid follow-up secrets authorize only bounded private-status projection; neither is copied into canonical or public records.
2. Missing references and incorrect secrets use the same bounded public failure, preventing enumeration.
3. Reviewer notes, abuse-control evidence, capability subjects, internal decision/application receipts, and raw upload metadata remain private.
4. Same-content replay is deterministic. Changed-content replay conflicts before duplicate private, canonical, Evidence, Candidate, relationship, correction, payment, or Media objects are created.
5. Stale state, invalid transition, incomplete prerequisite, duplicate execution, and partial failure close without public disclosure or ambiguous lifecycle state.
6. Private retention execution is exact-state guarded and durably receipted. Holds and suppression prevent premature deletion.
7. Private deletion cannot erase required canonical/public provenance, audit history, release history, or application receipts.
8. Canonical application and public release cannot retain unnecessary private payloads, follow-up secrets, abuse-control material, or raw object metadata.
9. Photos parent Submission retention, child Media retention, source-object deletion, and parent aggregate resolution remain separate and exact.
10. Repository evidence and configured production evidence remain distinct. Live deletion schedules, R2 lifecycle, Neon execution, and restore drills remain Phase 6 evidence.

## Partial-failure matrix

| Failure point | Required result |
| --- | --- |
| intake persistence after abuse-control reservation | deterministic retry or bounded conflict; no duplicate Submission |
| review decision after state changed | stale-state failure; no second terminal decision |
| canonical mutation before receipt completion | transaction rollback or retry-safe pending lifecycle; never silently applied |
| retention deletion before hold/prerequisite completion | deletion rejected and durably recorded |
| object deletion while eligible Media still depends on source | deletion rejected; child and parent state unchanged |
| publication/export attempt before release ownership | rejected by export/release lifecycle; no public activation |

## Evidence registration

The executable audit verifies that the common intake, abuse-control, private-status, review, terminal-resolution, application-registration/lifecycle, retention inventory, export/release, restore, and family-specific owners remain registered in repository checks. The dedicated workflow preserves the fixed P5-08A through P5-08D receipts.

## Handoff

P5-08E does not authorize production retention execution or publication. P5-08F remains the next owner for the final MVP-B integration closure and Phase 6 evidence handoff.
