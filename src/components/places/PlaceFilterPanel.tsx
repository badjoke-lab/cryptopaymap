import { X } from 'lucide-react';
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
  onPatch: (patch: Partial<DiscoveryUrlState>) => void;
  onClear: () => void;
  onClose: () => void;
}

interface FilterGroupProps {
  legend: string;
  options: PublicPlaceFilterFacet[];
  selected: readonly string[];
  onToggle: (value: string) => void;
}

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
  onPatch,
  onClear,
  onClose,
}: PlaceFilterPanelProps) {
  const activeCount =
    state.assets.length +
    state.networks.length +
    state.categories.length +
    state.routes.length +
    (state.statuses.length === 1 && state.statuses[0] === 'confirmed' ? 0 : state.statuses.length);

  return (
    <div className="fixed inset-0 z-50 lg:static lg:z-auto">
      <button
        className="absolute inset-0 bg-ink/30 lg:hidden"
        type="button"
        aria-label="Close filters"
        onClick={onClose}
      />

      <section
        className="absolute inset-x-0 bottom-0 max-h-[82svh] overflow-y-auto rounded-t-card border-x border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-panel lg:relative lg:inset-auto lg:mt-3 lg:max-h-none lg:overflow-visible lg:rounded-card lg:border lg:pb-4 lg:shadow-sm"
        aria-label="Place filters"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
          <div>
            <h2 className="m-0 text-base font-semibold text-ink">Filter public places</h2>
            <p className="mt-1 text-sm text-muted">
              {activeCount === 0
                ? 'Confirmed status is the default.'
                : `${activeCount} active ${activeCount === 1 ? 'filter' : 'filters'}.`}
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
              className="motion-feedback flex size-10 items-center justify-center rounded-control text-muted hover:bg-canvas lg:hidden"
              type="button"
              aria-label="Close filters"
              onClick={onClose}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>

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
