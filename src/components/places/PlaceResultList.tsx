import { useEffect, useRef } from 'react';
import type { PublicPlacePin } from '../../public/places-discovery';

interface PlaceResultListProps {
  pins: PublicPlacePin[];
  selectedPlace: string | null;
  scrollOffset: number;
  onScrollOffsetChange: (offset: number) => void;
  onSelectPlace: (placeSlug: string) => void;
  onClearFilters: () => void;
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

function reducedMotionPreferred(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : true;
}

export function PlaceResultList({
  pins,
  selectedPlace,
  scrollOffset,
  onScrollOffsetChange,
  onSelectPlace,
  onClearFilters,
}: PlaceResultListProps) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    const list = listRef.current;
    if (!list || Math.abs(list.scrollTop - scrollOffset) < 1) return;
    list.scrollTop = scrollOffset;
  }, [scrollOffset]);

  useEffect(() => {
    if (!selectedPlace) return;
    const item = itemRefs.current.get(selectedPlace);
    if (!item || typeof item.scrollIntoView !== 'function') return;
    item.scrollIntoView({ block: 'nearest', behavior: reducedMotionPreferred() ? 'auto' : 'smooth' });
  }, [selectedPlace]);

  if (pins.length === 0) {
    return (
      <section className="flex h-full min-h-0 items-center justify-center p-6" aria-labelledby="places-results-title">
        <div className="max-w-sm text-center">
          <h2 id="places-results-title" className="text-lg font-semibold text-ink">No places here</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Move the map, widen the area, or clear filters.</p>
          <button
            className="motion-feedback mt-4 min-h-11 rounded-control border border-border bg-surface px-4 py-2 font-semibold text-ink hover:bg-brand-50"
            type="button"
            onClick={onClearFilters}
          >
            Clear filters
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface" aria-labelledby="places-results-title">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 id="places-results-title" className="m-0 text-base font-semibold text-ink">Places nearby</h2>
          <p className="mt-0.5 text-xs text-muted">{pins.length} reviewed {pins.length === 1 ? 'place' : 'places'}</p>
        </div>
      </div>

      <ul
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto p-2"
        aria-label="Place results"
        onScroll={(event) => onScrollOffsetChange(event.currentTarget.scrollTop)}
      >
        {pins.map((pin) => {
          const isSelected = pin.placeSlug === selectedPlace;
          const location = [pin.locality, pin.countryCode].filter(Boolean).join(', ');
          return (
            <li
              key={pin.placeSlug}
              ref={(element) => {
                if (element) itemRefs.current.set(pin.placeSlug, element);
                else itemRefs.current.delete(pin.placeSlug);
              }}
              className="mb-1.5 last:mb-0"
            >
              <button
                className={`motion-feedback w-full rounded-[0.9rem] border p-3 text-left transition ${
                  isSelected
                    ? 'border-brand-600 bg-brand-50 shadow-sm'
                    : 'border-transparent bg-surface hover:border-border hover:bg-canvas'
                }`}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelectPlace(pin.placeSlug)}
              >
                <div className="flex gap-3">
                  {pin.thumbnail ? (
                    <img
                      className="size-20 shrink-0 rounded-[0.75rem] object-cover"
                      src={pin.thumbnail.url}
                      alt={pin.thumbnail.altText}
                      width={pin.thumbnail.width}
                      height={pin.thumbnail.height}
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex size-20 shrink-0 items-center justify-center rounded-[0.75rem] bg-canvas px-2 text-center text-xs font-semibold text-muted" aria-hidden="true">
                      {formatLabel(pin.categorySlug)}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-[0.98rem] font-semibold text-ink">{pin.name}</h3>
                        <p className="mt-0.5 truncate text-sm text-muted">{formatLabel(pin.categorySlug)}{location ? ` · ${location}` : ''}</p>
                      </div>
                      <span className={`mt-0.5 size-2.5 shrink-0 rounded-full ${pin.status === 'confirmed' ? 'bg-confirmed' : 'bg-stale'}`} aria-label={formatLabel(pin.status)} />
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {pin.assetSlugs.slice(0, 3).map((asset) => (
                        <span key={asset} className="rounded-pill bg-canvas px-2 py-1 text-xs font-semibold text-ink">
                          {formatLabel(asset)}
                        </span>
                      ))}
                      {pin.networkSlugs.slice(0, 2).map((network) => (
                        <span key={network} className="rounded-pill border border-border px-2 py-1 text-xs font-medium text-muted">
                          {formatLabel(network)}
                        </span>
                      ))}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                      <span>{pin.routeTypes.map(formatLabel).join(' · ')}</span>
                      <span className="shrink-0">{formatDate(pin.lastConfirmedAt)}</span>
                    </div>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
