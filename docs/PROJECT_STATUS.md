# CryptoPayMap project status

**Last verified:** 2026-07-07

## Current phase

Phase 4 — Public core / MVP-A

## Active work

- P4-16 — MVP-A integration and quality audit
- P4-17A — Places contract and tracking correction
- P4-17B — Map presentation foundation recovery
- Branch: `work/places-ux-contract-correction`
- Pull request: #122

## Required Places references

Before continuing Places work, read:

1. `docs/PLACES_UX_ACCEPTANCE.md`
2. `docs/PLACES_RECOVERY_PLAN.md`
3. the P4-17 section of `docs/IMPLEMENTATION_PLAN.md`

The complete 17-point recovery set in those documents remains required even when one pull request covers only part of it.

## Current recovery sequence

- P4-17A — contract and tracking correction — In progress
- P4-17B — map presentation foundation recovery — In progress
- P4-17C — Place information and public projection recovery — Planned
- P4-17D — desktop selected panel and mobile sheet recovery — Planned
- P4-17E — gallery, image enlargement, and external navigation — Planned
- P4-17F — state, responsive, accessibility, and final acceptance audit — Planned

## Current P4-17B scope

- stable broad default camera independent from first-pin ordering;
- bounded selected-Place initial focus with committed viewport precedence;
- street-map-oriented default basemap;
- explicit pin symbols for single Places;
- separate Confirmed, Stale, selected, and hover marker treatments;
- aggregate count-bearing cluster circles kept visually distinct from Place pins;
- regression tests for camera, style, marker layers, hover, selection, and movement state.

## Next

1. Complete P4-17B validation in #122.
2. Begin P4-17C canonical-model and public-projection review.
3. Execute P4-17C before selected surfaces depend on missing public Place fields.
4. Execute P4-17D and P4-17E in dependency order.
5. Run P4-17F and keep Phase 4 open until the full acceptance contract passes.
6. Add newly discovered Places defects to the acceptance contract and implementation tracking before closing them.

## Repository history relevant to this work

- Phase 3 repository work completed through #95.
- Public-core foundations P4-01 through P4-15 progressed through #119.
- P4-16A staging acceptance coverage completed through #120.
- P4-16B mobile List-to-Map synchronization completed through #121.
- #122 is the active corrective Places work.

## Blocked

No repository blocker. Deferred live verification remains separate from repository completion work.

## Verification rule

Repository reality is determined by the current branch, merged pull requests, and CI results. Required Places completion behavior is determined by the revised Places acceptance contract and recovery plan.
