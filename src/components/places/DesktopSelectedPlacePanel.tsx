import { X } from 'lucide-react';
import { buildPlaceDetailModel, type PublicPlace } from '../../public/place-detail';
import type { PublicPlacePin } from '../../public/places-discovery';

interface DesktopSelectedPlacePanelProps {
  pin: PublicPlacePin;
  place: PublicPlace | null;
  onClear: () => void;
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

export function DesktopSelectedPlacePanel({ pin, place, onClear }: DesktopSelectedPlacePanelProps) {
  const detail = place ? buildPlaceDetailModel(place) : null;
  const primaryClaim = detail?.claims[0] ?? null;
  const routeTypes = detail
    ? [...new Set(detail.claims.map((claim) => claim.routeType))]
    : pin.routeTypes;
  const processors = detail
    ? [
        ...new Set(
          detail.claims
            .map((claim) => claim.processorSlug)
            .filter((processor): processor is string => processor !== null),
        ),
      ]
    : [];

  return (
    <aside
      className="flex min-h-0 flex-col overflow-hidden rounded-card border border-border bg-surface"
      aria-label={`Selected place details: ${pin.name}`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
            Selected place
          </p>
          <h2 className="mt-1 text-xl font-semibold text-ink">{pin.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {formatLabel(pin.categorySlug)} ·{' '}
            {[pin.locality, pin.countryCode].filter(Boolean).join(', ')}
          </p>
        </div>
        <button
          className="motion-feedback flex size-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-canvas"
          type="button"
          aria-label="Clear selected place"
          onClick={onClear}
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {detail?.cover ? (
          <img
            className="aspect-[16/9] w-full rounded-card object-cover"
            src={detail.cover.url}
            alt={detail.cover.altText}
            width={detail.cover.width}
            height={detail.cover.height}
          />
        ) : (
          <div className="flex aspect-[16/9] w-full items-center justify-center rounded-card bg-canvas text-sm font-semibold text-muted">
            {formatLabel(pin.categorySlug)}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
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
            Last confirmed {formatDate(detail?.lastConfirmedAt ?? pin.lastConfirmedAt)}
          </span>
        </div>

        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Assets</dt>
            <dd className="mt-1 font-medium text-ink">
              {detail?.assetSymbols.join(', ') ?? pin.assetSlugs.map(formatLabel).join(', ')}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
              Networks
            </dt>
            <dd className="mt-1 font-medium text-ink">
              {(detail?.networkSlugs ?? pin.networkSlugs).map(formatLabel).join(', ')}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
              Payment route
            </dt>
            <dd className="mt-1 font-medium text-ink">{routeTypes.map(formatLabel).join(', ')}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
              Merchant receives
            </dt>
            <dd className="mt-1 font-medium text-ink">
              {primaryClaim ? formatLabel(primaryClaim.merchantReceives) : 'Not publicly confirmed'}
            </dd>
          </div>
        </dl>

        {processors.length > 0 ? (
          <div className="mt-4">
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
              Processor
            </p>
            <p className="mt-1 text-sm font-medium text-ink">
              {processors.map(formatLabel).join(', ')}
            </p>
          </div>
        ) : null}

        <section
          className="mt-5 rounded-card border border-border bg-canvas p-4"
          aria-label="How to pay"
        >
          <h3 className="m-0 text-sm font-semibold text-ink">How to pay</h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            {primaryClaim?.howToPay ?? 'Open the full record for verified payment instructions.'}
          </p>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border p-4">
        <a
          className="motion-feedback inline-flex min-h-11 items-center justify-center rounded-control bg-brand-600 px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-brand-700"
          href={`/place/${pin.placeSlug}`}
        >
          Payment details
        </a>
        <a
          className="motion-feedback inline-flex min-h-11 items-center justify-center rounded-control border border-border px-3 py-2 text-sm font-semibold text-ink no-underline hover:bg-brand-50"
          href={`/report?place=${encodeURIComponent(pin.placeSlug)}`}
        >
          Report a problem
        </a>
      </div>
    </aside>
  );
}
