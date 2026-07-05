import { List, LocateFixed, Map as MapIcon, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { filterPublicPlacePins, type PublicPlacePin } from '../../public/places-discovery';
import { createDiscoveryStore, type DiscoveryStoreApi } from '../../state/discovery-store';
import {
  defaultDiscoveryUrlState,
  parseDiscoveryUrlState,
  serializeDiscoveryUrlState,
} from '../../state/discovery-url';

interface PlacesAppProps {
  pins: PublicPlacePin[];
}

function formatLabel(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
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
  const patchUrlState = useStore(store, (state) => state.patchUrlState);
  const setUrlState = useStore(store, (state) => state.setUrlState);
  const setBottomSheet = useStore(store, (state) => state.setBottomSheet);
  const setFilterPanelOpen = useStore(store, (state) => state.setFilterPanelOpen);
  const setPendingViewport = useStore(store, (state) => state.setPendingViewport);
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

  const results = useMemo(() => filterPublicPlacePins(pins, urlState), [pins, urlState]);
  const selected =
    results.find((pin) => pin.placeSlug === urlState.selectedPlace) ??
    pins.find((pin) => pin.placeSlug === urlState.selectedPlace) ??
    null;

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
              onChange={(event) => patchUrlState({ search: event.target.value })}
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

            <div
              className="inline-flex rounded-control border border-border bg-surface p-1 lg:hidden"
              role="group"
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
            </div>
          </div>
        </div>

        {filterPanelOpen ? (
          <section
            className="mt-3 rounded-card border border-border bg-surface p-4 shadow-sm"
            aria-label="Place filters"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="m-0 text-sm font-semibold text-ink">Public status</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(['confirmed', 'stale'] as const).map((status) => {
                    const active = urlState.statuses.includes(status);
                    return (
                      <button
                        key={status}
                        className={`motion-feedback min-h-10 rounded-pill border px-3 py-1.5 text-sm font-semibold ${
                          active
                            ? 'border-brand-600 bg-brand-50 text-brand-800'
                            : 'border-border bg-surface text-muted'
                        }`}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          const statuses = active
                            ? urlState.statuses.filter((value) => value !== status)
                            : [...urlState.statuses, status];
                          patchUrlState({
                            statuses: statuses.length > 0 ? statuses : ['confirmed'],
                          });
                        }}
                      >
                        {formatLabel(status)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                className="motion-feedback min-h-10 rounded-control px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                type="button"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            </div>
          </section>
        ) : null}

        <div className="mt-5 grid min-h-[38rem] gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)]">
          <section
            className={`${urlState.view === 'list' ? 'hidden' : 'block'} relative overflow-hidden rounded-card border border-border bg-brand-50 lg:block`}
            aria-label="Map results"
          >
            <div className="absolute inset-0 opacity-30" aria-hidden="true">
              <div className="h-full w-full bg-[linear-gradient(to_right,#0f766e1a_1px,transparent_1px),linear-gradient(to_bottom,#0f766e1a_1px,transparent_1px)] bg-[size:48px_48px]" />
            </div>
            <div className="relative flex min-h-[38rem] flex-col items-center justify-center p-6 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-surface text-brand-700 shadow-panel">
                <MapIcon className="size-7" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-xl font-semibold text-ink">Map discovery surface</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted">
                The shell keeps map, list, filters, selection, and URL state coordinated while map
                rendering is added separately.
              </p>
              {pendingViewport ? (
                <button
                  className="motion-feedback mt-5 min-h-11 rounded-control bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700"
                  type="button"
                  onClick={() => {
                    patchUrlState({ viewport: pendingViewport });
                    setPendingViewport(null);
                  }}
                >
                  Search this area
                </button>
              ) : (
                <button
                  className="mt-5 inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-control border border-border bg-surface px-4 py-2 font-semibold text-muted"
                  type="button"
                  disabled
                >
                  <LocateFixed className="size-4" aria-hidden="true" /> Search this area
                </button>
              )}
            </div>

            {selected ? (
              <aside className="absolute inset-x-3 bottom-3 rounded-card border border-border bg-surface p-4 shadow-panel sm:inset-x-auto sm:left-4 sm:w-80">
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

          <section
            className={`${urlState.view === 'map' ? 'hidden' : 'block'} min-h-0 rounded-card border border-border bg-surface lg:block`}
            aria-labelledby="places-results-title"
          >
            <div className="border-b border-border p-4">
              <h2 id="places-results-title" className="m-0 text-lg font-semibold text-ink">
                Public results
              </h2>
              <p className="mt-1 text-sm text-muted">Confirmed records are shown by default.</p>
            </div>

            {results.length === 0 ? (
              <div className="p-6 text-center">
                <h3 className="text-lg font-semibold text-ink">No public places match</h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Candidate records are not used as substitutes. Clear filters or suggest a place
                  for review.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <button
                    className="motion-feedback min-h-11 rounded-control border border-border px-4 py-2 font-semibold text-ink hover:bg-brand-50"
                    type="button"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>
                  <a
                    className="motion-feedback inline-flex min-h-11 items-center rounded-control bg-brand-600 px-4 py-2 font-semibold text-white no-underline hover:bg-brand-700"
                    href="/suggest"
                  >
                    Suggest a place
                  </a>
                </div>
              </div>
            ) : (
              <ul className="m-0 max-h-[42rem] list-none overflow-y-auto p-3">
                {results.map((pin) => {
                  const isSelected = pin.placeSlug === urlState.selectedPlace;
                  return (
                    <li key={pin.placeSlug}>
                      <article
                        className={`rounded-card border p-4 ${
                          isSelected ? 'border-brand-600 bg-brand-50' : 'border-border bg-surface'
                        }`}
                      >
                        <button
                          className="w-full min-h-11 text-left"
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => selectPlace(pin.placeSlug)}
                        >
                          <span className="block text-base font-semibold text-ink">{pin.name}</span>
                          <span className="mt-1 block text-sm text-muted">
                            {[pin.locality, pin.countryCode].filter(Boolean).join(', ')}
                          </span>
                          <span className="mt-3 flex flex-wrap gap-2">
                            {pin.assetSlugs.map((asset) => (
                              <span
                                key={asset}
                                className="rounded-pill border border-border bg-canvas px-2.5 py-1 text-xs font-semibold text-muted"
                              >
                                {asset.toUpperCase()}
                              </span>
                            ))}
                          </span>
                          <span className="mt-3 block text-xs text-muted">
                            Last confirmed {formatDate(pin.lastConfirmedAt)}
                          </span>
                        </button>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
