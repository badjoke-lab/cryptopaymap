# Places UX final recovery audit

**Status:** Validation in progress  
**Last updated:** 2026-07-07

This is the durable completion matrix for P4-17. A partial pull-request scope or one green test run does not replace the complete 17-point contract.

Required companion documents:

- `docs/PLACES_UX_ACCEPTANCE.md`
- `docs/PLACES_RECOVERY_PLAN.md`
- `docs/PLACE_PUBLIC_PROFILE.md`
- `docs/PUBLIC_EXPORT_SCHEMAS.md`

## Final matrix

| # | Requirement | Implementation | Regression coverage | Status |
|---|---|---|---|---|
| 1 | Stable broad initial camera independent from record ordering | `PlacesMap.tsx` | `places-map.test.tsx` | Implemented |
| 2 | Street-map-oriented default basemap with override | `PlacesMap.tsx` | `places-map.test.tsx` | Implemented |
| 3 | Single Places render as pins, not generic dots | `PlacesMap.tsx` | `places-map.test.tsx` | Implemented |
| 4 | Place pins and aggregate clusters remain distinct | `PlacesMap.tsx` | `places-map.test.tsx` | Implemented |
| 5 | Practical reviewed Place information has canonical-to-public path | location schema, migration 0020, canonical schema, promotion persistence, public schema | schema checks, `place-public-profile.test.ts` | Implemented |
| 6 | Full reviewed address/location context reaches selected surfaces | public Place projection and detail model | selected-surface tests | Implemented |
| 7 | Desktop selected Place is useful without routine forced navigation | `DesktopSelectedPlacePanel.tsx` | `desktop-selected-place-panel.test.tsx` | Implemented |
| 8 | Mobile expanded sheet exposes routine practical and payment information | `MobilePlaceSheet.tsx` | `mobile-place-sheet.test.tsx` | Implemented |
| 9 | Mobile peek remains compact and distinct from expanded state | `MobilePlaceSheet.tsx` | mobile sheet and shell tests | Implemented |
| 10 | Sheet motion is position-based and follows bounded touch movement | `MobilePlaceSheet.tsx` | direct transform assertions | Implemented |
| 11 | Gallery is reachable from desktop and mobile selected surfaces | `PlaceMediaGallery.tsx` and selected surfaces | desktop/mobile integration tests | Implemented |
| 12 | Image enlargement supports close, keyboard, previous/next, swipe, focus return, and attribution | `PlaceMediaGallery.tsx` | `place-media-gallery.test.tsx` | Implemented |
| 13 | Google Maps and Apple Maps navigation handoff are explicit actions | `place-navigation.ts` and selected surfaces | navigation and integration tests | Implemented |
| 14 | Canonical detail page handles sharing, indexing, Evidence, history, and provenance rather than routine-info gating | selected surfaces plus `/place/{slug}` action | selected-surface and Place detail tests | Implemented |
| 15 | Current location focuses ephemerally before explicit area commit and exposes distinct failures | `PlacesApp.tsx` and pending viewport flow | current-location and map tests | Implemented |
| 16 | Repeated selection, List→Map selection, empty-map clear, and URL restoration are deterministic | `PlacesApp.tsx`, `PlacesMap.tsx` | shell and map tests | Implemented |
| 17 | Acceptance and regression evidence remain durable | acceptance docs, recovery plan, this matrix, tests | three repository workflows | Final workflow validation pending |

## Completion details

### Map foundation

Ordinary first visit uses a stable broad camera rather than `pins[0]`. A committed URL viewport takes precedence. Explicit Place selection may use bounded focus. Single Places use pin symbols with Confirmed, Stale, selected, and hover treatments. Aggregate clusters remain count-bearing circles.

### Practical Place information

The canonical location model and public projection can carry reviewed address fields, coordinates, branch website, phone, description, opening-hours text, amenities, and structured social links.

The P4-17C additions are optional and additive. Absence must not be rendered as a negative fact.

### Selected surfaces

Desktop selected Place and mobile expanded state show routine practical information when available. Payment context includes assets, networks, routes, payment methods, processor when applicable, merchant-receipt state, instructions, restrictions, and freshness.

Mobile peek is intentionally smaller: identity, status, category/location context, assets, and freshness.

### Mobile sheet motion

The sheet uses transform-based position states. During active drag, transition animation is disabled and bounded touch delta updates the transform directly. Release settles to valid state boundaries. Inner content scrolling remains separate from handle drag.

### Media

Approved public Place media is reachable from desktop and mobile. The enlarged viewer supports backdrop and close-button dismissal, Escape, previous/next controls, Arrow keys, horizontal touch swipe, focus entry/return, body scroll lock, and public attribution display when present.

### Navigation

Google Maps and Apple Maps links are destination handoff actions derived from public coordinates. They remain distinct from Website, Phone, social links, payment instructions, and internal detail navigation.

### Current location and selection

Successful geolocation creates temporary map focus and does not immediately serialize raw coordinates into the URL. Search this area remains the explicit commit boundary. Unsupported browser, permission denied, unavailable position, and timeout outcomes expose distinct feedback.

Selection preserves repeated-selection no-op behavior, List→Map selection, empty-canvas clearing, marker/control separation, filter-driven selection clearing, and URL/back restoration.

## Final closure rule

P4-17F is complete only when the same final branch head satisfies all 17 rows and these workflows all succeed:

1. Foundation validation
2. Migration drift
3. Staging review validation

Until then the recovery program remains in progress.
