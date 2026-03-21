# release candidate scope after PR367

## product-behavior code candidate
- app/api/places/overview/route.ts
- components/map/MapClient.tsx
- docs/api.md
- docs/state-machine-site.md
- lib/places/listPlacesOverviewForMap.ts

## tracking / notes only
- docs/tmp/testdb-local-check-20260318.md
- docs/tmp/testdb-preview-check-after-pr367.md
- docs/tmp/production-rollout-plan-after-pr367.md

## current interpretation
- the actual product change candidate is the new world / low-zoom overview path for /map
- docs/tmp files are verification / rollout notes only
- production decision still needs a separate choice:
  - code only
  - code + production DB data update
