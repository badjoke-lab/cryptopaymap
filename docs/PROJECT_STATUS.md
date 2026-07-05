# CryptoPayMap project status

**Last verified:** 2026-07-05

## Current phase

Phase 4 — Public core / MVP-A

## Current implementation item

P4-09 — Online Services discovery and detail

## Active work

- P4-09A — Online Services public discovery and detail
- Branch: `work/online-services-public`
- Pull request: #107

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
- P4-08A mobile selected Place sheet completed through pull request #106

## P4-09A in progress

- schema-validated public Online Services model
- Online Services content collection
- public `online-services.json` artifact boundary
- `/online` public index
- `/service/{slug}` static detail routes
- payment assets, networks, methods, processors, and acceptance scopes
- How to pay, restrictions, Evidence, and freshness presentation
- Candidate-free empty public state
- model aggregation and private-field rejection tests

## Next

1. Validate and merge pull request #107.
2. Build the public Home surface from existing public exports.
3. Continue Stats, Updates, Roadmap, and Changelog public surfaces.

## Blocked

No repository blocker. Live candidate generation, R2 activation, public serving, database migration, restore persistence deployment, and production verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
