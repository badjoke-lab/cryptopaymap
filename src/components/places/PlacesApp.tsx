import { Crosshair, List, Map as MapIcon, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { PublicPlace } from '../../public/place-detail';
import {
  buildPublicPlaceFilterFacets,
  filterPublicPlacePins,
  type PublicPlacePin,
} from '../../public/places-discovery';
import {
  readDiscoveryHistoryFromWindow,
  readDiscoveryHistorySnapshot,
  writeDiscoveryHistory,
  type DiscoveryHistoryMode,
} from '../../state/discovery-history';
import { createDiscoveryStore, type DiscoveryStoreApi } from '../../state/discovery-store';
import {
  defaultDiscoveryUrlState,
  mergeDiscoveryUrlState,
  serializeDiscoveryUrlState,
  type DiscoveryUrlState,
  type DiscoveryViewport,
} from '../../state/discovery-url';
import { DesktopSelectedPlacePanel } from './DesktopSelectedPlacePanel';
import { filterPinsByMapBounds } from './map-data';
import { MobilePlaceSheet } from './MobilePlaceSheet';
import { PlaceFilterPanel } from './PlaceFilterPanel';
import { PlaceResultList } from './PlaceResultList';
import { PlacesMap } from './PlacesMap';

interface PlacesAppProps {
  pins: PublicPlacePin[];
  places: PublicPlace[];
}

function createPlacesStore(): DiscoveryStoreApi {
  return createDiscoveryStore({ urlState: defaultDiscoveryUrlState });
}

function serializedState(state: DiscoveryUrlState): string {
  return serializeDiscoveryUrlState(state).toString();
}

function geolocationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === 1) return 'Location permission was denied. Allow location access and try again.';
  if (error.code === 2)
    return 'Current location is unavailable. Check device location services and try again.';
  if (error.code === 3) return 'Location request timed out. Try again.';
  return 'Location could not be read. Try again.';
}

export function PlacesApp({ pins, places }: PlacesAppProps) {
  const storeRef = useRef<DiscoveryStoreApi | null>(null);
  if (storeRef.current === null) storeRef.current = createPlacesStore();
  const store = storeRef.current;

  const urlState = useStore(store, (state) => state.urlState);
  const bottomSheet = useStore(store, (state) => state.bottomSheet);
  const listScrollOffset = useStore(store, (state) => state.listScrollOffset);
  const filterPanelOpen = useStore(store, (state) => state.filterPanelOpen);
  const pendingViewport = useStore(store, (state) => state.pendingViewport);
  const pendingBounds = useStore(store, (state) => state.pendingBounds);
  const activeBounds = useStore(store, (state) => state.activeBounds);
  const setUrlState = useStore(store, (state) => state.setUrlState);
  const setBottomSheet = useStore(store, (state) => state.setBottomSheet);
  const setListScrollOffset = useStore(store, (state) => state.setListScrollOffset);
  const setFilterPanelOpen = useStore(store, (state) => state.setFilterPanelOpen);
  const setPendingViewport = useStore(store, (state) => state.setPendingViewport);
  const setPendingBounds = useStore(store, (state) => state.setPendingBounds);
  const setActiveBounds = useStore(store, (state) => state.setActiveBounds);
  const historyModeRef = useRef<DiscoveryHistoryMode>('replace');
  const [urlReady, setUrlReady] = useState(false);
  const [focusViewport, setFocusViewport] = useState<DiscoveryViewport | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  function patchDiscoveryUrlState(
    patch: Partial<DiscoveryUrlState>,
    mode: DiscoveryHistoryMode = 'push',
  ) {
    const current = store.getState().urlState;
    const next = mergeDiscoveryUrlState(current, patch);
    if (serializedState(current) === serializedState(next)) return;
    historyModeRef.current = mode;
    setUrlState(next);
  }

  useEffect(() => {
    const initial = readDiscoveryHistoryFromWindow();
    setUrlState(initial.urlState);
    setBottomSheet(initial.uiState.bottomSheet);
    setListScrollOffset(initial.uiState.listScrollOffset);
    setFilterPanelOpen(initial.uiState.filterPanelOpen);
    setActiveBounds(initial.uiState.activeBounds);
    setUrlReady(true);

    const onPopState = (event: PopStateEvent) => {
      const restored = readDiscoveryHistorySnapshot(window.location.search, event.state);
      historyModeRef.current = 'replace';
      setUrlState(restored.urlState);
      setBottomSheet(restored.uiState.bottomSheet);
      setListScrollOffset(restored.uiState.listScrollOffset);
      setFilterPanelOpen(restored.uiState.filterPanelOpen);
      setActiveBounds(restored.uiState.activeBounds);
      setPendingViewport(null);
      setPendingBounds(null);
      setFocusViewport(null);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [
    setActiveBounds,
    setBottomSheet,
    setFilterPanelOpen,
    setListScrollOffset,
    setPendingBounds,
    setPendingViewport,
    setUrlState,
  ]);

  useEffect(() => {
    if (!urlReady) return;
    const mode = historyModeRef.current;
    historyModeRef.current = 'replace';
    writeDiscoveryHistory(
      urlState,
      { bottomSheet, listScrollOffset, filterPanelOpen, activeBounds },
      mode,
    );
  }, [activeBounds, bottomSheet, filterPanelOpen, listScrollOffset, urlReady, urlState]);

  useEffect(() => {
    if (!filterPanelOpen || !window.matchMedia('(max-width: 1023px)').matches) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFilterPanelOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [filterPanelOpen, setFilterPanelOpen]);

  const facets = useMemo(() => buildPublicPlaceFilterFacets(pins), [pins]);
  const filteredResults = useMemo(() => filterPublicPlacePins(pins, urlState), [pins, urlState]);
  const results = useMemo(
    () => filterPinsByMapBounds(filteredResults, activeBounds),
    [activeBounds, filteredResults],
  );
  const selected = results.find((pin) => pin.placeSlug === urlState.selectedPlace) ?? null;
  const placesBySlug = useMemo(
    () => new Map(places.map((place) => [place.placeSlug, place])),
    [places],
  );
  const selectedDetail = selected ? (placesBySlug.get(selected.placeSlug) ?? null) : null;
  const activeFilterCount =
    urlState.assets.length +
    urlState.networks.length +
    urlState.categories.length +
    urlState.routes.length +
    (urlState.statuses.length === 1 && urlState.statuses[0] === 'confirmed'
      ? 0
      : urlState.statuses.length);

  function selectPlace(placeSlug: string) {
    const current = store.getState().urlState;
    if (current.selectedPlace === placeSlug && current.view === 'map') return;
    patchDiscoveryUrlState({ selectedPlace: placeSlug, view: 'map' });
    setBottomSheet('peek');
  }

  function clearSelection() {
    patchDiscoveryUrlState({ selectedPlace: null });
    setBottomSheet('closed');
  }

  function clearFilters() {
    patchDiscoveryUrlState({
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

  function widenArea() {
    setActiveBounds(null);
    setPendingViewport(null);
    setPendingBounds(null);
    setFocusViewport(null);
  }

  function searchPendingArea() {
    if (!pendingViewport || !pendingBounds) return;
    setActiveBounds(pendingBounds);
    patchDiscoveryUrlState({ viewport: pendingViewport, selectedPlace: null });
    setPendingViewport(null);
    setPendingBounds(null);
    setFocusViewport(null);
    setBottomSheet('closed');
  }

  function locateCurrentUser() {
    if (!navigator.geolocation) {
      setLocationMessage('Current location is unavailable in this browser.');
      return;
    }
    setIsLocating(true);
    setLocationMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        setPendingViewport(null);
        setPendingBounds(null);
        patchDiscoveryUrlState({ selectedPlace: null, view: 'map' });
        setBottomSheet('closed');
        setFocusViewport({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          zoom: 14,
        });
      },
      (error) => {
        setIsLocating(false);
        setLocationMessage(geolocationErrorMessage(error));
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <section
      className="bg-canvas lg:h-[calc(100svh-3.5rem)] lg:min-h-[42rem] lg:overflow-hidden"
      aria-label="Places discovery"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="safe-area-inline border-b border-border bg-surface/95 px-3 py-2 shadow-sm backdrop-blur lg:px-5 lg:py-3">
          <div className="mx-auto flex w-full max-w-[1920px] items-center gap-2 lg:gap-3">
            <label className="relative min-w-0 flex-1 lg:max-w-[44rem]">
              <span className="sr-only">Search places</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                className="min-h-12 w-full rounded-control border border-border bg-canvas pl-11 pr-4 text-ink outline-none shadow-sm transition focus:border-brand-500 focus:bg-surface focus:ring-4 focus:ring-brand-100"
                type="search"
                value={urlState.search}
                onChange={(event) =>
                  patchDiscoveryUrlState(
                    { search: event.target.value, selectedPlace: null },
                    'replace',
                  )
                }
                placeholder="Search by place, city, or address"
              />
            </label>

            <button
              className="motion-feedback inline-flex min-h-12 shrink-0 items-center gap-2 rounded-control border border-border bg-surface px-3 font-semibold text-ink shadow-sm hover:bg-brand-50 lg:px-4"
              type="button"
              disabled={isLocating}
              onClick={locateCurrentUser}
            >
              <Crosshair className="size-5 text-brand-700" aria-hidden="true" />
              <span className="hidden sm:inline">{isLocating ? 'Locating…' : 'Near me'}</span>
            </button>

            <button
              className="motion-feedback inline-flex min-h-12 shrink-0 items-center gap-2 rounded-control border border-border bg-surface px-3 font-semibold text-ink shadow-sm hover:bg-brand-50 lg:px-4"
              type="button"
              aria-expanded={filterPanelOpen}
              onClick={() => setFilterPanelOpen(!filterPanelOpen)}
            >
              <SlidersHorizontal className="size-5" aria-hidden="true" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 ? (
                <span className="rounded-pill bg-brand-600 px-2 py-0.5 text-xs text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>

            <fieldset
              className="hidden rounded-control border border-border bg-canvas p-1 sm:inline-flex lg:hidden"
              aria-label="View mode"
            >
              <button
                className={`motion-feedback inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold ${
                  urlState.view === 'map' ? 'bg-surface text-brand-700 shadow-sm' : 'text-muted'
                }`}
                type="button"
                aria-pressed={urlState.view === 'map'}
                onClick={() => patchDiscoveryUrlState({ view: 'map' })}
              >
                <MapIcon className="size-4" aria-hidden="true" /> Map
              </button>
              <button
                className={`motion-feedback inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold ${
                  urlState.view === 'list' ? 'bg-surface text-brand-700 shadow-sm' : 'text-muted'
                }`}
                type="button"
                aria-pressed={urlState.view === 'list'}
                onClick={() => patchDiscoveryUrlState({ view: 'list' })}
              >
                <List className="size-4" aria-hidden="true" /> List
              </button>
            </fieldset>

            <div className="hidden shrink-0 items-center gap-2 xl:flex">
              <span className="rounded-pill bg-success-50 px-3 py-1.5 text-xs font-semibold text-success-800">
                Confirmed only
              </span>
              <span className="text-sm font-semibold tabular-nums text-muted">
                {results.length} {results.length === 1 ? 'place' : 'places'}
              </span>
            </div>
          </div>
          {locationMessage ? (
            <p className="mx-auto mt-2 w-full max-w-[1920px] text-sm text-error" role="status">
              {locationMessage}
            </p>
          ) : null}
        </div>

        {filterPanelOpen ? (
          <div className="relative z-40">
            <PlaceFilterPanel
              facets={facets}
              state={urlState}
              resultCount={results.length}
              onPatch={(patch) => patchDiscoveryUrlState(patch)}
              onClear={clearFilters}
              onWidenArea={widenArea}
              onClose={() => setFilterPanelOpen(false)}
            />
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1 lg:flex">
          <section
            className={`${urlState.view === 'list' ? 'hidden' : 'block'} relative min-h-0 flex-1 overflow-hidden bg-brand-50 lg:block`}
            aria-label="Map results"
          >
            <PlacesMap
              pins={results}
              selectedPlace={urlState.selectedPlace}
              committedViewport={urlState.viewport}
              focusViewport={focusViewport}
              onSelectPlace={selectPlace}
              onClearSelection={clearSelection}
              onViewportChange={setPendingViewport}
              onBoundsChange={setPendingBounds}
            />

            <div className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[calc(100%-6rem)] items-center gap-2 lg:hidden">
              <span className="rounded-pill border border-border bg-surface/95 px-3 py-2 text-xs font-semibold text-ink shadow-panel backdrop-blur">
                {results.length} places
              </span>
            </div>

            {pendingViewport && pendingBounds ? (
              <button
                className="motion-feedback absolute left-1/2 top-3 z-20 min-h-11 -translate-x-1/2 rounded-pill border border-brand-200 bg-surface/95 px-5 py-2 text-sm font-semibold text-brand-800 shadow-panel backdrop-blur hover:bg-brand-50"
                type="button"
                onClick={searchPendingArea}
              >
                Search this area
              </button>
            ) : null}
          </section>

          <aside
            className={`${urlState.view === 'map' ? 'hidden lg:flex' : 'flex'} min-h-0 w-full flex-col border-l border-border bg-surface lg:w-[25rem] xl:w-[27rem]`}
            aria-label="Place results"
          >
            <div className="flex min-h-12 items-center justify-between border-b border-border px-4">
              <strong className="text-sm text-ink">{results.length} places in this area</strong>
              {activeBounds ? (
                <button className="text-sm font-semibold text-brand-700" type="button" onClick={widenArea}>
                  Show all
                </button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1">
              <PlaceResultList
                pins={results}
                selectedPlace={urlState.selectedPlace}
                scrollOffset={listScrollOffset}
                onScrollOffsetChange={setListScrollOffset}
                onSelectPlace={selectPlace}
                onClearFilters={clearFilters}
              />
            </div>
          </aside>

          {selected ? (
            <aside className="hidden min-h-0 w-[25rem] shrink-0 border-l border-border bg-surface xl:block 2xl:w-[28rem]">
              <DesktopSelectedPlacePanel
                pin={selected}
                place={selectedDetail}
                onClear={clearSelection}
              />
            </aside>
          ) : null}

          {selected ? (
            <div className="absolute inset-y-0 right-0 z-30 hidden w-[25rem] border-l border-border bg-surface shadow-panel lg:block xl:hidden">
              <DesktopSelectedPlacePanel
                pin={selected}
                place={selectedDetail}
                onClear={clearSelection}
              />
            </div>
          ) : null}
        </div>

        <div className="safe-area-inline fixed bottom-3 left-1/2 z-30 flex -translate-x-1/2 rounded-pill border border-border bg-surface/95 p-1 shadow-panel backdrop-blur sm:hidden">
          <button
            className={`motion-feedback inline-flex min-h-10 items-center gap-1.5 rounded-pill px-4 text-sm font-semibold ${
              urlState.view === 'map' ? 'bg-brand-600 text-white' : 'text-muted'
            }`}
            type="button"
            aria-pressed={urlState.view === 'map'}
            onClick={() => patchDiscoveryUrlState({ view: 'map' })}
          >
            <MapIcon className="size-4" aria-hidden="true" /> Map
          </button>
          <button
            className={`motion-feedback inline-flex min-h-10 items-center gap-1.5 rounded-pill px-4 text-sm font-semibold ${
              urlState.view === 'list' ? 'bg-brand-600 text-white' : 'text-muted'
            }`}
            type="button"
            aria-pressed={urlState.view === 'list'}
            onClick={() => patchDiscoveryUrlState({ view: 'list' })}
          >
            <List className="size-4" aria-hidden="true" /> List
          </button>
        </div>

        <MobilePlaceSheet
          place={selected}
          detail={selectedDetail}
          state={bottomSheet}
          onStateChange={setBottomSheet}
          onClose={clearSelection}
        />
      </div>
    </section>
  );
}
