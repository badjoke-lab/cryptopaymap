# CryptoPayMap project status

**Last verified:** 2026-07-05

## Current phase

Phase 4 — Public core / MVP-A

## Current implementation item

P4-06 — Filters and bounded result updates

## Active work

- P4-06B — bounded viewport result updates
- Branch: `work/bounded-viewport-results`
- Pull request: #104

## Latest completed work

- Phase 2 completed through pull request #40
- Phase 3 repository work completed through pull request #95 with explicit live-verification deferrals
- P4-01A public Place detail foundation completed through pull request #96
- P4-02A coordinated PlacesApp public shell completed through pull request #97
- P4-03A map source and camera contracts completed through pull request #98
- P4-03B MapLibre renderer completed through pull request #100
- P4-04A production Place result list completed through pull request #101
- P4-05A pin and list synchronization completed through pull request #102
- P4-06A public Place facet filters completed through pull request #103

## P4-06B in progress

- visible map bounds contract and normalization
- ordinary and international-date-line bounds filtering
- pending versus active bounds state
- MapLibre moveend capture of pending viewport and visible bounds
- explicit Search this area commit boundary
- selected Place clearing when committed bounds change
- URL center and zoom commit at the same boundary
- optional bounds callback compatibility
- bounds model and store lifecycle tests

## Next

1. Validate and merge pull request #104.
2. Complete URL-state and browser-back restoration behavior.
3. Implement the mobile bottom sheet lifecycle.

## Blocked

No repository blocker. Live candidate generation, R2 activation, public serving, database migration, restore persistence deployment, and production verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
