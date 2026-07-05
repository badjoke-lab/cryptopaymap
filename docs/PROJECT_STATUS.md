# CryptoPayMap project status

**Last verified:** 2026-07-05

## Current phase

Phase 4 — Public core / MVP-A

## Current implementation item

P4-07 — URL state and browser-back restoration

## Active work

- P4-07A — Places browser history restoration
- Branch: `work/discovery-history-restoration`
- Pull request: #105

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

## P4-07A in progress

- explicit push and replace history modes
- search typing uses replaceState without excessive history entries
- discrete discovery changes create browser history entries
- popstate restores URL-owned discovery state without push echo
- validated session UI history snapshot
- active map bounds restoration
- bottom-sheet, filter-panel, and result-list scroll restoration state
- result-list scroll DOM synchronization
- history and restoration tests

## Next

1. Validate and merge pull request #105.
2. Implement the mobile bottom sheet lifecycle.
3. Continue Online Services public discovery and detail work.

## Blocked

No repository blocker. Live candidate generation, R2 activation, public serving, database migration, restore persistence deployment, and production verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
