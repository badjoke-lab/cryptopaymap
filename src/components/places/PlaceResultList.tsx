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

    item.scrollIntoView({
      block: 'nearest',
      behavior: reducedMotionPreferred() ? 'auto' : 'smooth',
    });
  }, [selectedPlace]);

  return (
    <section
      className={`min-h-0 rounded-card border border-border bg-surface ${
        selectedPlace ? 'lg:invisible' : ''
      }`}
      aria-labelledby="places-results-title"
    >
      <div className="border-b border-border p-3 sm:p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="places-results-title" className="m-0 text-lg font-semibold text-ink">
              Public results
            </h2>
            <p className="mt-1 text-sm text-muted">Confirmed records are shown by default.</p>
          </div>
          <span className="text-xs font-semibold text-muted" aria-live="polite">
            {pins.length} {pins.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      </div>

      {pins.length === 0 ? (
        <div className="p-6 text-center">
          <h3 className="text-lg font-semibold text-ink">No public places match</h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            Candidate records are not used as substitutes. Clear filters or suggest a place for
            review.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              className="motion-feedback min-h-11 rounded-control border border-border px-4 py-2 font-semibold text-ink hover:bg-brand-50"
              type="button"
              onClick={onClearFilters}
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
        <ul
          ref={listRef}
          className="m-0 list-none p-2 sm:p-3 lg:max-h-[42rem] lg:overflow-y-auto"
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
                data-place-slug={pin.placeSlug}
                data-selected={isSelected}
              >
                <article
                  className={`grid gap-3 rounded-card border p-3 motion-safe:transition-[border-color,background-color,transform] motion-safe:duration-fast sm:gap-4 sm:p-4 ${
                    isSelected
                      ? 'border-brand-600 bg-brand-50'
                      : 'border-border bg-surface hover:border-brand-200'
                  }`}
                >
                  <div className="flex gap-3">
                    {pin.thumbnail ? (
                      <img
                        className="size-16 shrink-0 rounded-control object-cover sm:size-20"
                        src={pin.thumbnail.url}
                        alt={pin.thumbnail.altText}
                        width={pin.thumbnail.width}
                        height={pin.thumbnail.height}
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="flex size-16 shrink-0 items-center justify-center rounded-control bg-canvas px-2 text-center text-[0.68rem] font-semibold text-muted sm:size-20 sm:text-xs"
                        aria-hidden="true"
                      >
                        {formatLabel(pin.categorySlug)}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-pill px-2.5 py-1 text-xs font-semibold ${
                            pin.status === 'confirmed'
                              ? 'bg-confirmed/10 text-confirmed'
                              : 'bg-stale/10 text-stale'
                          }`}
                        >
                          {formatLabel(pin.status)}
                        </span>
                        <span className="text-xs font-medium text-muted">
                          {formatLabel(pin.categorySlug)}
                        </span>
                      </div>
                      <h3 className="mt-1.5 text-base font-semibold text-ink sm:mt-2">{pin.name}</h3>
                      <p className="mt-0.5 text-sm text-muted sm:mt-1">{location}</p>
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:gap-3">
                    <div className="min-w-0">
                      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted sm:text-xs sm:tracking-[0.06em]">
                        Assets
                      </dt>
                      <dd className="mt-0.5 truncate font-medium text-ink sm:mt-1">
                        {pin.assetSlugs.map(formatLabel).join(', ')}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted sm:text-xs sm:tracking-[0.06em]">
                        Networks
                      </dt>
                      <dd className="mt-0.5 truncate font-medium text-ink sm:mt-1">
                        {pin.networkSlugs.map(formatLabel).join(', ')}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted sm:text-xs sm:tracking-[0.06em]">
                        Routes
                      </dt>
                      <dd className="mt-0.5 truncate font-medium text-ink sm:mt-1">
                        {pin.routeTypes.map(formatLabel).join(', ')}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted sm:text-xs sm:tracking-[0.06em]">
                        Last confirmed
                      </dt>
                      <dd className="mt-0.5 whitespace-nowrap font-medium text-ink sm:mt-1">
                        {formatDate(pin.lastConfirmedAt)}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex gap-2 border-t border-border pt-2.5 sm:flex-wrap sm:pt-3">
                    <button
                      className="motion-feedback min-h-11 min-w-0 flex-1 rounded-control border border-border px-2 py-2 text-sm font-semibold text-ink hover:bg-brand-50 sm:px-3"
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`Select ${pin.name} on map`}
                      onClick={() => onSelectPlace(pin.placeSlug)}
                    >
                      {isSelected ? 'Selected on map' : 'Show on map'}
                    </button>
                    <a
                      className="motion-feedback inline-flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-control bg-brand-600 px-2 py-2 text-center text-sm font-semibold text-white no-underline hover:bg-brand-700 sm:px-3"
                      href={`/place/${pin.placeSlug}`}
                    >
                      Payment details
                    </a>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
