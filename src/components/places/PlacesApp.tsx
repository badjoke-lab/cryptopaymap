import { List, Map as MapIcon, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import {
  buildPublicPlaceFilterFacets,
  filterPublicPlacePins,
  type PublicPlacePin,
} from '../../public/places-discovery';
import { createDiscoveryStore, type DiscoveryStoreApi } from '../../state/discovery-store';
import {
  defaultDiscoveryUrlState,
  parseDiscoveryUrlState,
  serializeDiscoveryUrlState,
} from '../../state/discovery-url';
import { filterPinsByMapBounds } from './map-data';
import { PlaceFilterPanel } from './PlaceFilterPanel';
import { PlaceResultList } from './PlaceResultList';
import { PlacesMap } from './PlacesMap';

interface PlacesAppProps {
  pins: PublicPlacePin[];
}

function createPlacesStore(): DiscoveryStoreApi {
  return createDiscoveryStore({ urlState: defaultDiscoveryUrlState });
}

export function PlacesApp({ pins }: PlacesAppProps) {
  const storeRef = useRef<DiscoveryStoreApi | null>(null);
  if (storeRef.current === null) storeRef.current = createPlacesStore();
  const store = storeRef.current;

  const urlState = useStore(store, (state) => state.urlState);
  const filterPanelOpen = useStore(store, (state) => state.filterPanelOpen);
  const pendingViewport = useStore(store, (state) => state.pendingViewport);
  const pendingBounds = useStore(store, (state) => state.pendingBounds);
  const activeBounds = useStore(store, (state) => state.activeBounds);
  const patchUrlState = useStore(store, (state) => state.patchUrlState);
  const setUrlState = useStore(store, (state) => state.setUrlState);
  const setBottomSheet = useStore(store, (state) => state.setBottomSheet);
  const setFilterPanelOpen = useStore(store, (state) => state.setFilterPanelOpen);
  const setPendingViewport = useStore(store, (state) => state.setPendingViewport);
  const setPendingBounds = useStore(store, (state) => state.setPendingBounds);
  const setActiveBounds = useStore(store, (state) => state.setActiveBounds);
  const [urlReady, setUrlReady] = useState(false);

  useEffect(() => {
    setUrlState(parseDiscoveryUrlState(window.location.search));
    setUrlReady(true);

    const onPopState = () => setUrlState(parseDiscoveryUrlState(window.location.search));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [setUrlState]);

  useEffect(() => {
    if (!urlReady) return;
    const query = serializeDiscoveryUrlState(urlState).toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [urlReady, urlState]);

  const facets = useMemo(() => buildPublicPlaceFilterFacets(pins), [pins]);
  const filteredResults = useMemo(() => filterPublicPlacePins(pins, urlState), [pins, urlState]);
  const results = useMemo(
    () => filterPinsByMapBounds(filteredResults, activeBounds),
    [activeBounds, filteredResults],
  );
  const selected = results.find((pin) => pin.placeSlug === urlState.selectedPlace) ?? null;

  function selectPlace(placeSlug: string) {
    patchUrlState({ selectedPlace: placeSlug });
    setBottomSheet('peek');
  }

  function clearSelection() {
    patchUrlState({ selectedPlace: null });
    setBottomSheet('closed');
  }

  function clearFilters() {
    patchUrlState({
      search: '',
      assets: [],
      networks: [],
      categories: [],
      routes: [],
      statuses: ['confirmed'],
      selectedPlace: null,
    });
    setBottomSheet('closed');
    setPendingViewport(null);
    setPendingBounds(null);
  }

  function searchPendingArea() {
    if (!pendingViewport || !pendingBounds) return;

    setActiveBounds(pendingBounds);
    patchUrlState({ viewport: pendingViewport, selectedPlace: null });
    setPendingViewport(null);
    setPendingBounds(null);
    setBottomSheet('closed');
  }

  return (
    <section className="min-h-[calc(100svh-8rem)] bg-canvas" aria-label="Places discovery">
      <div className="safe-area-inline page-container py-5 sm:py-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="m-0 text-sm font-semibold text-brand-700">Verified physical places</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] text-ink sm:text-4xl">
              Places
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">
              Search reviewed public records by payment details. Candidate records are never shown
              here.
            </p>
          </div>
          <span className="rounded-pill border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted">
            {results.length} {results.length === 1 ? 'place' : 'places'}
          </span>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <label className="relative block">
            <span className="sr-only">Search places</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              className="min-h-12 w-full rounded-control border border-border bg-surface pl-11 pr-4 text-ink shadow-sm"
              type="search"
              value={urlState.search}
              onChange={(event) =>
                patchUrlState({ search: event.target.value, selectedPlace: null })
              }
              placeholder="Search name, category, city, or country"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              className="motion-feedback inline-flex min-h-11 items-center gap-2 rounded-control border border-border bg-surface px-4 py-2 font-semibold text-ink hover:bg-brand-50"
              type="button"
              aria-expanded={filterPanelOpen}
              onClick={() => setFilterPanelOpen(!filterPanelOpen)}
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Filters
            </button>

            <fieldset
              className="inline-flex rounded-control border border-border bg-surface p-1 lg:hidden"
              aria-label="View mode"
            >
              <button
                className={`motion-feedback inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold ${
                  urlState.view === 'map' ? 'bg-brand-600 text-white' : 'text-muted'
                }`}
                type="button"
                aria-pressed={urlState.view === 'map'}
                onClick={() => patchUrlState({ view: 'map' })}
              >
                <MapIcon className="size-4" aria-hidden="true" /> Map
              </button>
              <button
                className={`motion-feedback inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold ${
                  urlState.view === 'list' ? 'bg-brand-600 text-white' : 'text-muted'
                }`}
                type="button"
                aria-pressed={urlState.view === 'list'}
                onClick={() => patchUrlState({ view: 'list' })}
              >
                <List className="size-4" aria-hidden="true" /> List
              </button>
            </fieldset>
          </div>
        </div>

        {filterPanelOpen ? (
          <PlaceFilterPanel
            facets={facets}
            state={urlState}
            onPatch={patchUrlState}
            onClear={clearFilters}
          />
        ) : null}

        <div className="mt-5 grid min-h-[38rem] gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)]">
          <section
            className={`${urlState.view === 'list' ? 'hidden' : 'block'} relative overflow-hidden rounded-card border border-border bg-brand-50 lg:block`}
            aria-label="Map results"
          >
            <PlacesMap
              pins={results}
              selectedPlace={urlState.selectedPlace}
              committedViewport={urlState.viewport}
              onSelectPlace={selectPlace}
              onViewportChange={setPendingViewport}
              onBoundsChange={setPendingBounds}
            />

            {pendingViewport && pendingBounds ? (
              <button
                className="motion-feedback absolute left-1/2 top-3 z-10 min-h-11 -translate-x-1/2 rounded-control bg-brand-600 px-4 py-2 font-semibold text-white shadow-panel hover:bg-brand-700"
                type="button"
                onClick={searchPendingArea}
              >
                Search this area
              </button>
            ) : null}

            {selected ? (
              <aside className="absolute inset-x-3 bottom-3 z-10 rounded-card border border-border bg-surface p-4 shadow-panel sm:inset-x-auto sm:left-4 sm:w-80">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
                      Selected place
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-ink">{selected.name}</h3>
                  </div>
                  <button
                    className="motion-feedback flex size-11 items-center justify-center rounded-control text-muted hover:bg-canvas"
                    type="button"
                    aria-label="Clear selected place"
                    onClick={clearSelection}
                  >
                    <X className="size-5" aria-hidden="true" />
                  </button>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {selected.assetSlugs.join(', ')} · {selected.networkSlugs.join(', ')}
                </p>
                <a
                  className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-700"
                  href={`/place/${selected.placeSlug}`}
                >
                  View payment details
                </a>
              </aside>
            ) : null}
          </section>

          <div className={urlState.view === 'map' ? 'hidden lg:block' : 'block'}>
            <PlaceResultList
              pins={results}
              selectedPlace={urlState.selectedPlace}
              onSelectPlace={selectPlace}
              onClearFilters={clearFilters}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
