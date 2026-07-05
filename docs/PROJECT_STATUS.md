# CryptoPayMap project status

**Last verified:** 2026-07-05

## Current phase

Phase 4 — Public core / MVP-A

## Current implementation item

P4-03 — MapLibre map

## Active work

- P4-03A — map source and camera contract foundation
- Branch: `work/map-geojson-foundation`
- Pull request: pending

## Latest completed work

- Phase 2 completed through pull request #40
- P3-01 through P3-06 completed through pull request #47
- P3-07 completed through pull request #58
- P3-08 completed through pull request #63
- P3-09 completed through pull request #67
- P3-10 completed through pull request #74
- P3-11 completed through pull request #87
- P3-12A normalized audit history read contract completed through pull request #88
- P3-12B bounded audit history aggregation completed through pull request #89
- P3-12C durable audit history source adapters completed through pull request #92
- P3-12D protected audit history API completed through pull request #93
- P3-12E Audit administration surface completed through pull request #94
- P3-12F Phase 3 cross-domain integration audit completed through pull request #95
- Phase 3 repository work completed with explicit live-verification deferrals
- P4-01A public Place detail foundation completed through pull request #96
- P4-02A coordinated PlacesApp public shell completed through pull request #97

## P4-03A in progress

- deterministic public Place pin to point-feature conversion
- stable feature identity by public Place slug
- selected Place marker property
- map camera normalization aligned with public URL limits
- camera change detection after normalization
- unit coverage for source and camera contracts

## Next

1. Validate and merge P4-03A.
2. Add the MapLibre renderer against the fixed source and camera contracts.
3. Connect renderer move events to pending viewport and Search this area behavior.

## Blocked

No repository blocker. MapLibre renderer dependency is not yet present in the lockfile and will be added as a separate reviewed implementation step. Live candidate generation, R2 activation, public serving, database migration, restore persistence deployment, and production verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
