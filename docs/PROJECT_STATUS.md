# CryptoPayMap project status

**Last verified:** 2026-07-05

## Current phase

Phase 4 — Public core / MVP-A

## Current implementation item

P4-08 — Mobile bottom sheet

## Active work

- P4-08A — mobile selected Place sheet lifecycle
- Branch: `work/mobile-place-sheet`
- Pull request: #106

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
- P4-06B bounded viewport result updates completed through pull request #104
- P4-07A Places browser history restoration completed through pull request #105

## P4-08A in progress

- dedicated mobile selected Place sheet
- closed, peek, and expanded lifecycle states
- selection opens the sheet in peek state
- peek payment summary with status, asset, and last-confirmed date
- expanded location, network, and payment-route context
- payment detail and report actions
- safe-area-aware fixed mobile layout
- desktop selected panel separation
- PlacesApp lifecycle coverage

## Next

1. Validate and merge pull request #106.
2. Continue Online Services public discovery and detail work.
3. Continue Home, Stats, Updates, Roadmap, and Changelog public surfaces.

## Blocked

No repository blocker. Live candidate generation, R2 activation, public serving, database migration, restore persistence deployment, and production verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
