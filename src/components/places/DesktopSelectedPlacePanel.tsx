import { ExternalLink, MapPinned, X } from 'lucide-react';
import { buildPlaceDetailModel, type PublicPlace } from '../../public/place-detail';
import type { PublicPlacePin } from '../../public/places-discovery';
import { buildPlaceNavigationLinks } from './place-navigation';

interface DesktopSelectedPlacePanelProps {
  pin: PublicPlacePin;
  place: PublicPlace | null;
  onClear: () => void;
}

function formatLabel(value: string): string {
  return value
    .split(/[_-]/)
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
  const profile = detail?.place ?? null;
  const primaryClaim = detail?.claims[0] ?? null;
  const routeTypes = detail
    ? [...new Set(detail.claims.map((claim) => claim.routeType))]
    : pin.routeTypes;
  const paymentMethods = detail
    ? [...new Set(detail.claims.flatMap((claim) => claim.paymentAssets.map((payment) => payment.paymentMethod)))]
    : [];
  const processors = detail
    ? [...new Set(detail.claims.map((claim) => claim.processorSlug).filter((processor): processor is string => processor !== null))]
    : [];
  const assets = detail?.assetSymbols ?? pin.assetSlugs.map(formatLabel);
  const networks = detail?.networkSlugs ?? pin.networkSlugs;
  const navigation = buildPlaceNavigationLinks({ latitude: pin.latitude, longitude: pin.longitude });
  const location = detail?.address || [pin.locality, pin.countryCode].filter(Boolean).join(', ');

  return (
    <aside className="flex h-full min-h-0 flex-col bg-surface" aria-label={`Selected place details: ${pin.name}`}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative">
          {detail?.cover ? (
            <img
              className="aspect-[16/8] w-full object-cover"
              src={detail.cover.url}
              alt={detail.cover.altText}
              width={detail.cover.width}
              height={detail.cover.height}
            />
          ) : (
            <div className="aspect-[16/7] w-full bg-gradient-to-br from-brand-50 to-canvas" />
          )}
          <button
            className="motion-feedback absolute right-3 top-3 flex size-10 items-center justify-center rounded-full border border-border bg-surface/95 text-ink shadow-panel backdrop-blur hover:bg-canvas"
            type="button"
            aria-label="Clear selected place"
            onClick={onClear}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-pill px-2.5 py-1 text-xs font-semibold ${pin.status === 'confirmed' ? 'bg-confirmed/10 text-confirmed' : 'bg-stale/10 text-stale'}`}>
              {formatLabel(pin.status)}
            </span>
            <span className="text-xs font-medium text-muted">{formatLabel(pin.categorySlug)}</span>
          </div>

          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-ink">{pin.name}</h2>
          {location ? <p className="mt-1 text-sm leading-6 text-muted">{location}</p> : null}

          <section className="mt-5 rounded-[1rem] border border-brand-200 bg-brand-50 p-4" aria-label="How to pay">
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-brand-800">How to pay</p>
            <p className="mt-2 text-sm font-medium leading-6 text-ink">
              {primaryClaim?.howToPay ?? 'Open the full record for reviewed payment instructions.'}
            </p>
          </section>

          <div className="mt-4 flex flex-wrap gap-2">
            {assets.map((asset) => (
              <span key={asset} className="rounded-pill bg-ink px-3 py-1.5 text-xs font-semibold text-white">{asset}</span>
            ))}
            {networks.map((network) => (
              <span key={network} className="rounded-pill border border-border bg-canvas px-3 py-1.5 text-xs font-semibold text-ink">{formatLabel(network)}</span>
            ))}
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-[0.85rem] bg-canvas p-3">
              <dt className="text-xs font-semibold text-muted">Route</dt>
              <dd className="mt-1 font-semibold text-ink">{routeTypes.map(formatLabel).join(', ')}</dd>
            </div>
            <div className="rounded-[0.85rem] bg-canvas p-3">
              <dt className="text-xs font-semibold text-muted">Method</dt>
              <dd className="mt-1 font-semibold text-ink">{paymentMethods.length > 0 ? paymentMethods.map(formatLabel).join(', ') : 'See record'}</dd>
            </div>
            <div className="rounded-[0.85rem] bg-canvas p-3">
              <dt className="text-xs font-semibold text-muted">Processor</dt>
              <dd className="mt-1 font-semibold text-ink">{processors.length > 0 ? processors.map(formatLabel).join(', ') : 'Direct / unspecified'}</dd>
            </div>
            <div className="rounded-[0.85rem] bg-canvas p-3">
              <dt className="text-xs font-semibold text-muted">Last confirmed</dt>
              <dd className="mt-1 font-semibold text-ink">{formatDate(detail?.lastConfirmedAt ?? pin.lastConfirmedAt)}</dd>
            </div>
          </dl>

          <div className="mt-5 flex gap-2">
            <a
              className="motion-feedback inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control border border-border bg-surface px-3 py-2 text-sm font-semibold text-ink no-underline hover:bg-canvas"
              href={navigation.googleMapsUrl}
              target="_blank"
              rel="noreferrer"
            >
              <MapPinned className="size-4" aria-hidden="true" /> Navigate
            </a>
            {profile?.websiteUrl ? (
              <a
                className="motion-feedback inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control border border-border bg-surface px-3 py-2 text-sm font-semibold text-ink no-underline hover:bg-canvas"
                href={profile.websiteUrl}
                target="_blank"
                rel="noreferrer"
              >
                Website <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            ) : null}
          </div>

          {profile?.description ? (
            <section className="mt-6 border-t border-border pt-5" aria-label="About this place">
              <h3 className="text-sm font-semibold text-ink">About</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{profile.description}</p>
            </section>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border bg-surface p-4">
        <a
          className="motion-feedback inline-flex min-h-12 items-center justify-center rounded-control bg-brand-600 px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-brand-700"
          href={`/place/${pin.placeSlug}`}
        >
          Full details
        </a>
        <a
          className="motion-feedback inline-flex min-h-12 items-center justify-center rounded-control border border-border px-3 py-2 text-sm font-semibold text-ink no-underline hover:bg-canvas"
          href={`/report?place=${encodeURIComponent(pin.placeSlug)}`}
        >
          Report issue
        </a>
      </div>
    </aside>
  );
}
