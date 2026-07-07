import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type {
  PublicPlaceFilterFacet,
  PublicPlaceFilterFacets,
} from '../../public/places-discovery';
import type {
  DiscoveryRouteFilter,
  DiscoveryStatusFilter,
  DiscoveryUrlState,
} from '../../state/discovery-url';

interface PlaceFilterPanelProps {
  facets: PublicPlaceFilterFacets;
  state: DiscoveryUrlState;
  resultCount: number;
  onPatch: (patch: Partial<DiscoveryUrlState>) => void;
  onClear: () => void;
  onWidenArea: () => void;
  onClose: () => void;
}

interface FilterGroupProps {
  legend: string;
  options: PublicPlaceFilterFacet[];
  selected: readonly string[];
  onToggle: (value: string) => void;
}

const focusableSelector = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function formatLabel(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function toggleValue(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function FilterGroup({ legend, options, selected, onToggle }: FilterGroupProps) {
  if (options.length === 0) return null;

  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              className={`motion-feedback min-h-10 rounded-pill border px-3 py-1.5 text-sm font-semibold ${
                active
                  ? 'border-brand-600 bg-brand-50 text-brand-800'
                  : 'border-border bg-surface text-muted hover:border-brand-200'
              }`}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(option.value)}
            >
              {formatLabel(option.value)} <span className="font-normal">({option.count})</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function PlaceFilterPanel({
  facets,
  state,
  resultCount,
  onPatch,
  onClear,
  onWidenArea,
  onClose,
}: PlaceFilterPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (
      typeof window.matchMedia !== 'function' ||
      !window.matchMedia('(max-width: 1023px)').matches
    ) {
      return;
    }

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;

      const focusable = [...panel.querySelectorAll<HTMLElement>(focusableSelector)].filter(
        (element) => element.tabIndex >= 0,
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        closeButtonRef.current?.focus();
        return;
      }

      const activeElement = document.activeElement;
      const focusOutsidePanel = !activeElement || !panel.contains(activeElement);
      if (event.shiftKey && (activeElement === first || focusOutsidePanel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || focusOutsidePanel)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      previousActiveElement?.focus();
    };
  }, []);

  const activeCount =
    state.assets.length +
    state.networks.length +
    state.categories.length +
    state.routes.length +
    (state.statuses.length === 1 && state.statuses[0] === 'confirmed' ? 0 : state.statuses.length);
  const staleIncluded = state.statuses.includes('stale');

  return (
    <div className="fixed inset-0 z-50 lg:static lg:z-auto">
      <button
        className="absolute inset-0 bg-ink/30 lg:hidden"
        type="button"
        tabIndex={-1}
        aria-label="Close filters"
        onClick={onClose}
      />

      <section
        ref={panelRef}
        className="absolute inset-x-0 bottom-0 max-h-[82svh] overflow-y-auto rounded-t-card border-x border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-panel lg:relative lg:inset-auto lg:mt-3 lg:max-h-none lg:overflow-visible lg:rounded-card lg:border lg:pb-4 lg:shadow-sm"
        aria-label="Place filters"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
          <div>
            <h2 className="m-0 text-base font-semibold text-ink">Filter public places</h2>
            <p className="mt-1 text-sm text-muted" aria-live="polite">
              {resultCount} {resultCount === 1 ? 'place' : 'places'} match
              {activeCount === 0
                ? '. Confirmed status is the default.'
                : ` · ${activeCount} active ${activeCount === 1 ? 'filter' : 'filters'}.`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="motion-feedback min-h-10 rounded-control px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
              type="button"
              onClick={onClear}
            >
              Clear
            </button>
            <button
              ref={closeButtonRef}
              className="motion-feedback flex size-10 items-center justify-center rounded-control text-muted hover:bg-canvas lg:hidden"
              type="button"
              aria-label="Close filters"
              onClick={onClose}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {resultCount === 0 ? (
          <section
            className="mt-4 rounded-card border border-border bg-canvas p-4"
            aria-label="No matching places guidance"
          >
            <h3 className="m-0 text-sm font-semibold text-ink">No public places match</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Candidate records are not used as substitutes. Try a wider area or another public
              discovery path.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="motion-feedback min-h-10 rounded-control border border-border bg-surface px-3 py-2 text-sm font-semibold text-ink hover:bg-brand-50"
                type="button"
                onClick={onWidenArea}
              >
                Widen area
              </button>
              {!staleIncluded ? (
                <button
                  className="motion-feedback min-h-10 rounded-control border border-border bg-surface px-3 py-2 text-sm font-semibold text-ink hover:bg-brand-50"
                  type="button"
                  onClick={() =>
                    onPatch({
                      statuses: [...state.statuses, 'stale'],
                      selectedPlace: null,
                    })
                  }
                >
                  Include Stale
                </button>
              ) : null}
              <a
                className="motion-feedback inline-flex min-h-10 items-center rounded-control border border-border bg-surface px-3 py-2 text-sm font-semibold text-ink no-underline hover:bg-brand-50"
                href="/online"
              >
                Online Services
              </a>
              <a
                className="motion-feedback inline-flex min-h-10 items-center rounded-control border border-border bg-surface px-3 py-2 text-sm font-semibold text-ink no-underline hover:bg-brand-50"
                href="/suggest"
              >
                Suggest a Place
              </a>
            </div>
          </section>
        ) : null}

        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <FilterGroup
            legend="Assets"
            options={facets.assets}
            selected={state.assets}
            onToggle={(value) =>
              onPatch({ assets: toggleValue(state.assets, value), selectedPlace: null })
            }
          />
          <FilterGroup
            legend="Networks"
            options={facets.networks}
            selected={state.networks}
            onToggle={(value) =>
              onPatch({ networks: toggleValue(state.networks, value), selectedPlace: null })
            }
          />
          <FilterGroup
            legend="Categories"
            options={facets.categories}
            selected={state.categories}
            onToggle={(value) =>
              onPatch({ categories: toggleValue(state.categories, value), selectedPlace: null })
            }
          />
          <FilterGroup
            legend="Payment routes"
            options={facets.routes}
            selected={state.routes}
            onToggle={(value) =>
              onPatch({
                routes: toggleValue(state.routes, value) as DiscoveryRouteFilter[],
                selectedPlace: null,
              })
            }
          />
          <FilterGroup
            legend="Public status"
            options={facets.statuses}
            selected={state.statuses}
            onToggle={(value) => {
              const next = toggleValue(state.statuses, value) as DiscoveryStatusFilter[];
              onPatch({ statuses: next.length > 0 ? next : ['confirmed'], selectedPlace: null });
            }}
          />
        </div>
      </section>
    </div>
  );
}
