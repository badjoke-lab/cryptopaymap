# production rollout complete 2026-03-22

## completed
- merged map world / low-zoom overview mode into main
- added missing production DB records from test branch subset
- refreshed production stats cache
- merged follow-up hotfixes for place-level pin rendering and marker flicker reduction

## final production state
- total_places = 12751
- countries = 15
- cities = 3769
- categories = 44
- stats meta.as_of = 2026-03-21T14:42:27.452Z

## verified endpoints
- /api/stats
- /api/places/overview?bbox=-180,-85,180,85&zoom=2
- /api/places/osm:node:10004226017
- /api/places/osm:node:10054832617
- /api/places/osm:way:400846769

## rollout result
- world / low-zoom 2000-cap UX issue resolved
- production code rollout complete
- production data rollout complete
- production stats refresh complete
- production pin-render hotfixes applied
