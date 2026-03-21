# production rollout plan after PR367

## scope
- code:
  - map world / low-zoom overview API changes from PR367
- db:
  - production DB unverified bulk import status must be confirmed separately before any prod rollout
  - do not assume test branch DB state equals production DB state

## preflight checks
1. confirm current production DB counts before any change
2. confirm rollback path
   - code rollback: revert / rollback deployment
   - DB rollback: only use documented DB rollback method if needed
3. confirm production env/data source settings before any action
4. confirm no additional uncommitted test-only changes remain

## rollout order
1. decide whether this rollout is:
   - code only
   - code + production DB data update
2. if code only:
   - merge/select target code branch for production path
   - deploy
   - verify production URLs
3. if code + DB:
   - first document exact DB execution procedure separately
   - run DB change only after explicit go decision
   - then verify app behavior against production DB

## production verification URLs
- /map
- /api/places/overview?bbox=-180,-85,180,85&zoom=2
- /api/places/osm:node:10004226017
- /stats

## expected checks
- /map world / low-zoom uses overview mode
- overview API responds successfully
- detail API responds correctly for known place IDs
- stats respond consistently for production state
- no obvious map flicker / blanking regression

## stop conditions
- production DB target/state is not explicitly confirmed
- rollback path is unclear
- production env/data source differs from expected
- map behavior in production does not match test-branch verification enough to proceed safely

## notes
- test branch verification passed on chore/testdb-preview-check
- PR367 merged into chore/testdb-preview-check
- production rollout decision still pending
