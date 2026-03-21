# testdb preview check after PR367

- branch: chore/testdb-preview-check
- PR: #367 merged
- local env: test branch DB confirmed

## checks
- GET /api/places/overview?bbox=-180,-85,180,85&zoom=2
  - clusters=32
  - totalPlaces=12751
  - cellSizeDeg=13.5
- GET /api/places/osm:node:10004226017
  - Boatcenter Lugano returned
- GET /api/stats
  - total_places=12751
  - countries=15
  - cities=3769
  - categories=44

## result
- world / low-zoom overview path works on test DB
- place detail works
- stats snapshot works
- chore/testdb-preview-check verification passed
