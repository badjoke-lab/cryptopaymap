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
  if (error.code === 1) {
    return 'Location permission was denied. Allow location access and try again.';
  }
  if (error.code === 2) {
    return 'Current location is unavailable. Check device location services and try again.';
  }
  if (error.code === 3) {
    return 'Location request timed out. Try again.';
  }
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
    <section className="min-h-[calc(100svh-3.5rem)] bg-canvas" aria-label="Places discovery">
      <div className="safe-area-inline page-container py-3 lg:py-7">
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
              Verified places
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-[-0.035em] text-ink">Places</h1>
          </div>
          <span className="rounded-pill border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted">
            {results.length} {results.length === 1 ? 'place' : 'places'}
          </span>
        </div>

        <div className="hidden items-end justify-between gap-4 lg:flex">
          <div>
            <p className="m-0 text-sm font-semibold text-brand-700">Verified physical places</p>
            <h1 className="mt-1 text-4xl font-semibold tracking-[-0.035em] text-ink">Places</h1>
            <p className="mt-2 max-w-2xl text-base leading-6 text-muted">
              Search reviewed public records by payment details. Candidate records are never shown
              here.
            </p>
          </div>
          <span className="rounded-pill border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted">
            {results.length} {results.length === 1 ? 'place' : 'places'}
          </span>
        </div>

        <div className="mt-3 grid gap-2 lg:mt-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-3">
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
                patchDiscoveryUrlState(
                  { search: event.target.value, selectedPlace: null },
                  'replace',
                )
              }
              placeholder="Search place, category, city, or country"
            />
          </label>

          <div className="flex items-center justify-between gap-2 lg:justify-start">
            <button
              className="motion-feedback hidden min-h-11 items-center gap-2 rounded-control border border-border bg-surface px-4 py-2 font-semibold text-ink hover:bg-brand-50 lg:inline-flex"
              type="button"
              disabled={isLocating}
              onClick={locateCurrentUser}
            >
              <Crosshair className="size-4" aria-hidden="true" />
              {isLocating ? 'Locating…' : 'Current location'}
            </button>
            <button
              className="motion-feedback hidden min-h-11 items-center gap-2 rounded-control border border-border bg-surface px-4 py-2 font-semibold text-ink hover:bg-brand-50 lg:inline-flex"
              type="button"
              aria-expanded={filterPanelOpen}
              onClick={() => setFilterPanelOpen(!filterPanelOpen)}
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" /> Filters
              {activeFilterCount > 0 ? (
                <span className="rounded-pill bg-brand-50 px-2 py-0.5 text-xs text-brand-800">
                  {activeFilterCount}
                </span>
              ) : null}
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
                onClick={() => patchDiscoveryUrlState({ view: 'map' })}
              >
                <MapIcon className="size-4" aria-hidden="true" /> Map
              </button>
              <button
                className={`motion-feedback inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold ${
                  urlState.view === 'list' ? 'bg-brand-600 text-white' : 'text-muted'
                }`}
                type="button"
                aria-pressed={urlState.view === 'list'}
                onClick={() => patchDiscoveryUrlState({ view: 'list' })}
              >
                <List className="size-4" aria-hidden="true" /> List
              </button>
            </fieldset>
          </div>
        </div>

        {locationMessage ? (
          <p className="mt-2 text-sm text-error" role="status">
            {locationMessage}
          </p>
        ) : null}

        {filterPanelOpen ? (
          <PlaceFilterPanel
            facets={facets}
            state={urlState}
            resultCount={results.length}
            onPatch={(patch) => patchDiscoveryUrlState(patch)}
            onClear={clearFilters}
            onWidenArea={widenArea}
            onClose={() => setFilterPanelOpen(false)}
          />
        ) : null}

        <div className="mt-3 grid gap-4 lg:mt-5 lg:min-h-[38rem] lg:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)]">
          <section
            className={`${urlState.view === 'list' ? 'hidden' : 'block'} relative overflow-hidden rounded-card border border-border bg-brand-50 lg:block`}
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

            <div className="pointer-events-none absolute left-2 top-2 z-20 flex max-w-[calc(100%-4rem)] items-center gap-1.5 lg:hidden">
              <button
                className="pointer-events-auto motion-feedback inline-flex min-h-11 items-center gap-1.5 rounded-control border border-border bg-surface/95 px-3 text-sm font-semibold text-ink shadow-sm backdrop-blur"
                type="button"
                disabled={isLocating}
                onClick={locateCurrentUser}
              >
                <Crosshair className="size-4" aria-hidden="true" />{' '}
                {isLocating ? 'Locating…' : 'Locate'}
              </button>
              <button
                className="pointer-events-auto motion-feedback inline-flex min-h-11 items-center gap-1.5 rounded-control border border-border bg-surface/95 px-3 text-sm font-semibold text-ink shadow-sm backdrop-blur"
                type="button"
                aria-expanded={filterPanelOpen}
                onClick={() => setFilterPanelOpen(true)}
              >
                <SlidersHorizontal className="size-4" aria-hidden="true" /> Filters
              </button>
              <span className="rounded-pill border border-border bg-surface/95 px-2.5 py-2 text-xs font-semibold text-muted shadow-sm backdrop-blur">
                {results.length} places
              </span>
            </div>

            {pendingViewport && pendingBounds ? (
              <button
                className="motion-feedback absolute left-1/2 top-16 z-10 min-h-10 -translate-x-1/2 rounded-control bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-panel hover:bg-brand-700 lg:top-3 lg:min-h-11 lg:px-4 lg:text-base"
                type="button"
                onClick={searchPendingArea}
              >
                Search this area
              </button>
            ) : null}
          </section>

          <div
            className={`${urlState.view === 'map' ? 'hidden lg:block' : 'block'} relative min-h-0`}
          >
            <PlaceResultList
              pins={results}
              selectedPlace={urlState.selectedPlace}
              scrollOffset={listScrollOffset}
              onScrollOffsetChange={setListScrollOffset}
              onSelectPlace={selectPlace}
              onClearFilters={clearFilters}
            />
            {selected ? (
              <div className="absolute inset-0 z-10 hidden bg-canvas lg:block">
                <DesktopSelectedPlacePanel
                  pin={selected}
                  place={selectedDetail}
                  onClear={clearSelection}
                />
              </div>
            ) : null}
          </div>
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
