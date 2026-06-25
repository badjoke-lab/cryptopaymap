# CryptoPayMap state management

## Purpose

This document assigns one owner to each kind of application state. It prevents fetched public data, temporary interface details, shareable discovery conditions, and sensitive workflow data from being mixed in one global store or exposed through URLs.

## Ownership model

| State kind | Owner | Examples |
|---|---|---|
| public server data | TanStack Query | place records, online-service records, public Stats, public Updates |
| coordinated application UI | per-island Zustand store | selected presentation state, sheet state, filter panel, pending search area |
| shareable discovery state | URL search parameters | query, asset, network, category, route, status, viewport, selected public place, map/list mode |
| browser restoration details | `history.state` | bottom-sheet state, list scroll offset, filter-panel state |
| local component state | React local state | input draft before submission, disclosure open state, temporary animation state |
| canonical and review state | server/database | candidates, claims, evidence, submissions, decisions, audit events |

No layer silently becomes the source of truth for another layer.

## TanStack Query

TanStack Query owns data fetched from public or authenticated server endpoints.

Rules:

- query results are not copied into Zustand;
- query keys identify resource type and normalized public parameters;
- failed refreshes do not clear unrelated UI or URL state;
- public queries may retry once by default;
- mutations do not retry automatically;
- window-focus refetching is disabled by default and may be enabled for a specific resource with a documented freshness need;
- private submission or administration queries use separate authenticated endpoints and must never share public cache keys;
- cache contents are not treated as canonical publication state.

Initial query-key pattern:

```text
['places', normalizedPublicFilters]
['place', publicSlug]
['online-services', normalizedPublicFilters]
['online-service', publicSlug]
['stats', version]
['updates', page]
```

Query keys contain normalized public values, not free-form objects with private fields.

## Zustand

Zustand owns coordinated client UI state inside one React application area.

The discovery store is created by a Provider for each hydrated application area. It is not a module-global singleton. This prevents state sharing between unrelated islands or server renders.

Current discovery UI state:

- canonical URL state snapshot;
- bottom-sheet state;
- list scroll offset;
- filter-panel state;
- pending map viewport before the user chooses **Search this area**.

Rules:

- fetched records do not enter the UI store;
- submission payloads, contact details, status secrets, evidence originals, and review notes do not enter the public discovery store;
- actions update explicit fields rather than replacing the store with arbitrary objects;
- ephemeral state may be restored from browser history but is not shareable;
- future Places implementation uses a single store inside the coordinated `PlacesApp` area.

## Public URL state

The URL is the public, shareable discovery contract.

### Parameters

| Parameter | Meaning | Example |
|---|---|---|
| `q` | normalized search text | `q=coffee` |
| `asset` | comma-separated asset slugs | `asset=btc,usdc` |
| `network` | comma-separated network slugs | `network=base,lightning` |
| `category` | comma-separated category slugs | `category=cafe,hotel` |
| `route` | direct or processor route | `route=direct_wallet` |
| `status` | public status filters | `status=confirmed,stale` |
| `lat` | map-center latitude | `lat=35.68124` |
| `lng` | map-center longitude | `lng=139.76712` |
| `z` | map zoom | `z=13.5` |
| `place` | selected public place slug | `place=example-coffee` |
| `view` | `map` or `list` | `view=list` |

### Normalization

- slugs are lowercase and restricted to safe slug characters;
- duplicate values are removed;
- lists are sorted for deterministic URLs;
- search text is whitespace-normalized and length-bounded;
- latitude, longitude, and zoom are finite and clamped to valid ranges;
- coordinates are rounded before serialization;
- Candidate is not an allowed public status;
- default `confirmed` status and default `map` view are omitted;
- unknown parameters are not copied into canonical state.

### History behavior

Use `pushState` when the user creates a meaningful navigable discovery step, such as:

- selecting or clearing a public place;
- changing an asset, network, category, route, or status filter;
- applying a search.

Use `replaceState` when the change should not create another Back-button stop, such as:

- switching map/list presentation;
- updating the settled viewport after map interaction;
- writing bottom-sheet or scroll restoration data;
- canonicalizing an invalid or non-deterministic query string.

The `popstate` handler restores both normalized URL state and validated ephemeral history state.

## Browser history state

The following values may be stored in `history.state` under the `cpmDiscovery` namespace:

- bottom-sheet state;
- list scroll offset;
- filter-panel open state.

They are validated before use. Unknown values are discarded.

History state is a convenience for browser restoration, not durable storage and not a security boundary.

## Local component state

Use React local state when no other component needs the value and it does not need sharing, URL representation, or browser-history restoration.

Examples:

- whether one disclosure is open;
- a temporary form draft before it becomes a Submission;
- toast visibility;
- animation presence;
- a local hover or pressed state.

Do not promote local state into Zustand merely to avoid prop passing across one small component boundary.

## Current-location privacy

The user's exact current location is not automatically written to the URL, analytics, or persistent storage.

A map viewport may become URL state after the user intentionally searches or shares that area. The URL represents a public map view, not proof of the user's physical location.

## Forbidden URL and public state values

Never place these values in URL parameters, fragments, public Query keys, or the public discovery store:

- submission status secrets;
- email addresses or contact details;
- wallet addresses supplied as evidence;
- transaction identifiers submitted privately;
- owner-verification material;
- private evidence URLs;
- internal notes, review decisions, or priority scores;
- Candidate identifiers not intentionally public;
- exact current-location history;
- Cloudflare, Neon, R2, or API credentials;
- private partnership or sponsorship data.

Secret status links use an opaque path or token contract defined by the submission system and are not discovery filters.

## Provider composition

`AppStateProviders` composes:

1. the shared reduced-motion policy;
2. a Query Client instance for server state;
3. a per-island Discovery Store instance for coordinated UI state.

The Query Client and Zustand store are created once for the lifetime of the hydrated application area. They are not recreated on every render.

## Extension rules

A new global state field requires all of the following:

1. more than one component needs it;
2. its owner cannot be server data, URL state, browser history state, or local state;
3. its public/private classification is explicit;
4. serialization and reset behavior are defined;
5. browser navigation behavior is considered;
6. the field does not duplicate canonical data.

A new URL parameter additionally requires:

- a stable public meaning;
- deterministic parsing and serialization;
- bounds and invalid-value handling;
- an explicit push/replace rule;
- confirmation that it exposes no private information.

## Validation checklist

- URL parse and serialization are deterministic.
- Unknown or invalid values fail closed to safe defaults.
- Candidate cannot enter public status filters.
- Back and Forward restore the expected discovery state.
- Query refresh does not reset filters or selected view.
- Ephemeral UI state does not appear in copied URLs.
- Private values never appear in URLs, logs, analytics, or public Query keys.
- Multiple React application areas do not share one accidental global UI store.
