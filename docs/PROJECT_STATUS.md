# CryptoPayMap project status

**Last verified:** 2026-07-07

## Current phase

Phase 4 — Public core / MVP-A

## Active work

- P4-16 — MVP-A integration and quality audit
- P4-17A — Places contract and tracking correction
- P4-17B — Map presentation foundation recovery
- P4-17C — Place information and public projection recovery
- Branch: `work/places-ux-contract-correction`
- Pull request: #122

## Required Places references

Before continuing Places work, read:

1. `docs/PLACES_UX_ACCEPTANCE.md`
2. `docs/PLACES_RECOVERY_PLAN.md`
3. the P4-17 section of `docs/IMPLEMENTATION_PLAN.md`

The complete 17-point recovery set remains required even when one pull request covers only part of it.

## Recovery sequence

- P4-17A — contract and tracking correction — In progress
- P4-17B — map presentation foundation recovery — In progress; validation passed before P4-17C changes began
- P4-17C — Place information and public projection recovery — In progress
- P4-17D — desktop selected panel and mobile sheet recovery — Planned
- P4-17E — gallery, image enlargement, and external navigation — Planned
- P4-17F — state, responsive, accessibility, and final acceptance audit — Planned

## Current P4-17C scope

- preserve reviewed address, locality, region, postal code, country, coordinates, website, and phone fields;
- add canonical description, opening-hours text, amenities, and structured social links;
- persist those fields through candidate promotion;
- extend public Place schemas and validation fixtures;
- preserve provenance, privacy, source, license, allowlist, and leakage boundaries;
- update documentation and selected-Place model tests before P4-17D depends on the new fields.

## Next

1. Complete P4-17C validation in #122.
2. Execute P4-17D after P4-17C validation succeeds.
3. Execute P4-17E in dependency order.
4. Run P4-17F and keep Phase 4 open until the full acceptance contract passes.
5. Add newly discovered Places defects to the acceptance contract and implementation tracking.

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
