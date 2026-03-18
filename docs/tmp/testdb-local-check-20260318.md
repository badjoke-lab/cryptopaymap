# testdb local check

## scope
- Map: pass
- Discover: pass
- Stats snapshot/counts/rankings: pass
- Stats trends: deferred / not release blocker for this step

## API checks
- inserted sample osm:node:10004226017 => 200
- exact overlap existing osm:node:10054832617 => 200
- semantic-exact skipped osm:node:13202871690 => 404
- semantic-exact kept osm:way:400846769 => 200

## stats snapshot
- meta.source = snapshot_fast_path
- total_places = 12751
- total_count = 12751
- breakdown.owner = 5
- breakdown.directory = 2
- breakdown.unverified = 12744

## note
- trends remains zero-baseline / deferred for later investigation
