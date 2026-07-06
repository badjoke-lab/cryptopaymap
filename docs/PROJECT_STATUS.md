# CryptoPayMap project status

**Last verified:** 2026-07-06

## Current phase

Phase 4 — Public core / MVP-A

## Current implementation item

P4-12 — Updates

## Active work

- P4-12A — public Updates record-change surface
- Branch: `work/public-updates`
- Pull request: #115

## Latest completed work

- Phase 2 completed through pull request #40
- Phase 3 repository work completed through pull request #95 with explicit live-verification deferrals
- P4-01 Place detail completed through pull request #96
- P4-02 PlacesApp shell completed through pull request #97
- P4-03 MapLibre map completed through pull requests #98 and #100
- P4-04 Result list completed through pull request #101
- P4-05 Pin and list synchronization completed through pull request #102
- P4-06 Filters and bounded result updates completed through pull requests #103 and #104
- P4-07 URL state and browser back restoration completed through pull request #105
- P4-08 Mobile selected Place sheet completed through pull request #106
- P4-09 Online Services discovery and detail completed through pull request #107
- P4-10 Home discovery surface completed through pull request #108
- P4-11 Stats surface completed through pull request #109
- URL-review staging environment and deploy receipts completed through pull requests #110 and #111
- Mobile staging map loading and container sizing fixes completed through pull requests #112 and #113
- Responsive mobile and desktop interaction boundaries completed through pull request #114

## P4-12A in progress

- validated public `updates.json` artifact
- Updates content collection
- deterministic descending chronology and month grouping
- public `/updates` surface
- explicit zero-update state
- direct links to corresponding Place and Online Service records
- synthetic staging Updates feed covering all six public update types
- model and staging-feed tests

## Next

1. Validate and merge pull request #115.
2. Build P4-13 public Roadmap and Changelog release surfaces.
3. Continue P4-14 trust, data, legal, and sustainability pages.
4. Integrate public Media in P4-15.
5. Run the P4-16 MVP-A integration and quality audit, including responsive and staging acceptance checks.

## Blocked

No repository blocker. Live database, Access, R2, migration, restore persistence deployment, and production verification remain deferred until their scheduled live-verification stages.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
