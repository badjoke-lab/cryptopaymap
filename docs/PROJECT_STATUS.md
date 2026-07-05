# CryptoPayMap project status

**Last verified:** 2026-07-05

## Current phase

Phase 4 — Public core / MVP-A

## Current implementation item

P4-05 — Pin and list synchronization

## Active work

- P4-05A — shared Place selection lifecycle
- Branch: `work/pin-list-sync`
- Pull request: #102

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
- P4-03A map source and camera contracts completed through pull request #98
- P4-03B MapLibre renderer completed through pull request #100
- P4-04A production Place result list completed through pull request #101

## P4-05A in progress

- selected map Place scrolls the corresponding result card into view
- reduced-motion-aware list scroll behavior
- stable public Place slug to list-element synchronization
- list selection updates the selected marker property in the public map source
- existing marker click path continues to update shared Place selection
- component coverage for both synchronization directions

## Next

1. Validate and merge pull request #102.
2. Extend public filters and bounded result updates.
3. Complete URL-state and browser-back restoration behavior.

## Blocked

No repository blocker. Live candidate generation, R2 activation, public serving, database migration, restore persistence deployment, and production verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
