# Places UX acceptance contract

## Purpose

This document defines the required interaction behavior for `/places` across desktop and mobile. Shared public data and URL state do not imply a shared visual shell. Desktop and mobile use different interaction structures while preserving the same discovery state.

## Shared behavior

Both layouts must preserve these rules:

- Confirmed Places are visible by default.
- Stale Places are opt-in.
- Candidate records are never substituted into public results.
- Map movement alone does not replace the current result set.
- After deliberate user map movement, `Search this area` appears and applies the pending viewport only when pressed.
- Search, facets, selected Place, committed viewport, zoom, and Map/List mode are URL-owned where applicable.
- Back/forward navigation restores the committed discovery state.
- Selected Place, selected marker, and selected list item remain synchronized.
- Loading, empty, map-unavailable, and map-error states always retain a usable list path.
- Focus and reduced-motion behavior must remain usable.

## Desktop contract

### Structure

At `lg` and above, the primary discovery workspace is a stable two-column application surface:

```text
Discovery controls
Map 60% | Results or selected Place 40%
```

The right-side workspace does not disappear when a Place is selected. It changes responsibility from result browsing to selected Place context.

### Discovery controls

Desktop provides direct access to:

- Search
- Asset
- Network
- Category
- Payment type
- Public status
- Current location

The design may use compact selects, chips, popovers, or a bounded control panel, but the common discovery facets and location action must be reachable without opening a mobile-style full-screen sheet.

### Map

The map provides:

- clustering
- selected marker treatment
- user-driven pan and zoom
- `Search this area` after deliberate user map movement
- Current location action
- persistent results while a pending area has not been committed

### Right-side workspace: normal state

Show the public result list with:

- visible result count
- Place name
- category
- locality/country
- status
- assets
- networks
- payment route summary
- last confirmed date

Selecting a result must select and reveal its marker without losing the current discovery context.

### Right-side workspace: selected state

Show a selected Place panel containing, when public data is available:

- cover or category fallback
- Place name
- category and location
- status
- assets
- networks
- Direct wallet or Processor checkout route
- processor when applicable
- How to pay
- Merchant receives
- last confirmed date
- link to full payment details
- problem-report route

Closing the selected panel clears selection and returns the right-side workspace to the result list without clearing search, filters, or committed viewport.

### Selection behavior

- Marker selection selects the matching list result and opens selected Place context.
- List selection selects the marker and moves/reveals the map camera as needed.
- Re-selecting the same marker is a no-op.
- Clicking or tapping empty map canvas may clear selection.
- Interacting with navigation controls, discovery controls, result list, or selected Place panel must not accidentally clear selection.

## Mobile contract

### App shell

Below `lg`, `/places` is an application surface rather than a vertically stacked desktop page.

The primary structure is:

```text
Compact header
Map or List primary mode
Map HUD / search and filters access
Bottom sheet for selected Place
```

The map mode should use the available dynamic viewport height beneath the compact header and safe areas. It must not inherit a desktop fixed minimum height that produces page-like dead space or forces the footer into the primary map workflow.

### Mobile header and menu

- Keep the primary header compact.
- Use a mobile menu surface rather than a compressed horizontal desktop navigation row.
- Menu, Filters, and selected Place sheet must have deterministic stacking and must not close one another accidentally.

### Map HUD

Map mode provides a compact, non-blocking HUD containing:

```text
Locate | Filters | N places
```

The exact visual treatment may evolve, but these responsibilities remain available without leaving the map.

### Filters

Mobile filters open as a sheet/overlay over the map instead of pushing the map down the document.

The sheet provides:

- Asset
- Network
- Category
- Payment type
- Public status
- clear/reset action
- visible result count
- zero-result guidance

Zero-result guidance must not cover the center of the map. It should be presented in the filter/list context and may offer:

- widen the area
- include Stale
- view Online Services
- suggest a Place

### Map/List mode

- Map and List are mutually explicit primary modes on mobile.
- Switching modes preserves search, filters, selection, viewport, sheet state where valid, and list position.
- List mode uses page-level scrolling rather than unnecessary nested scrolling.

### Bottom sheet

Selected Place uses three application states:

```text
closed
peek
expanded
```

`peek` prioritizes:

- Place name
- assets
- last confirmed date

`expanded` adds, when public data is available:

- status
- How to pay
- networks
- route type
- processor when applicable
- Merchant receives
- location
- full detail route
- problem-report route

Interaction requirements:

- tapping a single marker opens `peek`
- tapping/selecting a list result opens `peek` and synchronizes the marker
- upward drag or explicit expand action moves to `expanded`
- downward drag from `expanded` returns to `peek`
- closing the sheet clears selection
- empty-map interaction may close the sheet and clear selection
- map controls, Filters, and Menu interactions must not accidentally close the selected Place state
- detailed content and heavy media should not overload `peek`

### State restoration

Returning from a Place detail page, or using browser back/forward, restores where valid:

- viewport
- zoom
- filters
- selected Place
- Map/List mode
- bottom-sheet state
- list scroll position

## Responsive quality gates

A responsive change is not accepted only because it avoids overflow. Acceptance requires separate desktop and mobile interaction checks.

### Desktop checks

- 60/40 map/workspace structure is visible and stable.
- Discovery controls and Current location are directly usable.
- Selecting a marker and a list result produces synchronized state.
- Selected Place context contains payment-useful information rather than only a name and links.
- Empty map canvas clearing does not make controls or sidebar interactions clear selection.

### Mobile checks

- compact header and menu work without horizontal navigation overflow
- map occupies the intended dynamic viewport workspace
- `Locate | Filters | N places` responsibilities remain available on map mode
- Filters overlay does not push the map down the page
- marker selection opens `peek`
- sheet expands and collapses predictably
- Map/List mode preserves discovery state
- no horizontal page overflow at narrow widths
- safe-area and touch targets remain usable

## Non-goals

This contract does not require copying the previous CryptoPayMap visual design. It preserves useful interaction behavior while the current product retains its own verification model, public data contract, URL state, MapLibre renderer, and design system.
