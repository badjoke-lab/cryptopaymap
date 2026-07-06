import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { buildPlaceDetailModel, type PublicPlace } from '../../public/place-detail';
import type { PublicPlacePin } from '../../public/places-discovery';
import type { BottomSheetState } from '../../state/discovery-store';

interface MobilePlaceSheetProps {
  place: PublicPlacePin | null;
  detail?: PublicPlace | null;
  state: BottomSheetState;
  onStateChange: (state: BottomSheetState) => void;
  onClose?: () => void;
}

const swipeThreshold = 48;

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

export function MobilePlaceSheet({
  place,
  detail = null,
  state,
  onStateChange,
  onClose,
}: MobilePlaceSheetProps) {
  const touchStartY = useRef<number | null>(null);
  const touchCurrentY = useRef<number | null>(null);
  const detailModel = useMemo(() => (detail ? buildPlaceDetailModel(detail) : null), [detail]);

  if (!place || state === 'closed') return null;

  const expanded = state === 'expanded';
  const primaryClaim = detailModel?.claims[0] ?? null;
  const location =
    detailModel?.address || [place.locality, place.countryCode].filter(Boolean).join(', ');
  const networks = detailModel?.networkSlugs ?? place.networkSlugs;
  const routes = detailModel
    ? [...new Set(detailModel.claims.map((claim) => claim.routeType))]
    : place.routeTypes;
  const processors = detailModel
    ? [
        ...new Set(
          detailModel.claims
            .map((claim) => claim.processorSlug)
            .filter((processor): processor is string => processor !== null),
        ),
      ]
    : [];
  const assets = detailModel?.assetSymbols ?? place.assetSlugs.map(formatLabel);
  const lastConfirmedAt = detailModel?.lastConfirmedAt ?? place.lastConfirmedAt;

  function closeSheet() {
    if (onClose) onClose();
    else onStateChange('closed');
  }

  function handleTouchStart(event: React.TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartY.current = touch.clientY;
    touchCurrentY.current = touch.clientY;
  }

  function handleTouchMove(event: React.TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    if (!touch || touchStartY.current === null) return;
    touchCurrentY.current = touch.clientY;
  }

  function handleTouchEnd() {
    if (touchStartY.current === null || touchCurrentY.current === null) return;
    const deltaY = touchCurrentY.current - touchStartY.current;

    if (deltaY < -swipeThreshold) {
      onStateChange('expanded');
    } else if (deltaY > swipeThreshold && expanded) {
      onStateChange('peek');
    }

    touchStartY.current = null;
    touchCurrentY.current = null;
  }

  return (
    <section
      className={`fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-card border-x border-t border-border bg-surface shadow-panel transition-[height] duration-normal motion-reduce:transition-none lg:hidden ${
        expanded ? 'h-[88dvh]' : 'h-[35dvh] min-h-52'
      }`}
      aria-label={`Selected place: ${place.name}`}
      data-sheet-state={state}
    >
      <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
        <div
          className="relative shrink-0 touch-pan-x border-b border-border px-4 pb-3 pt-2"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <button
            className="motion-feedback mx-auto flex min-h-11 w-full items-center justify-center"
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse place details' : 'Expand place details'}
            onClick={() => onStateChange(expanded ? 'peek' : 'expanded')}
          >
            <span className="h-1.5 w-12 rounded-pill bg-border" aria-hidden="true" />
          </button>
          <button
            className="motion-feedback absolute right-2 top-2 flex size-11 items-center justify-center rounded-control text-muted hover:bg-canvas"
            type="button"
            aria-label="Close selected place"
            onClick={closeSheet}
          >
            <X className="size-5" aria-hidden="true" />
          </button>

          <div className="pr-12">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-pill px-2.5 py-1 text-xs font-semibold ${
                  place.status === 'confirmed'
                    ? 'bg-confirmed/10 text-confirmed'
                    : 'bg-stale/10 text-stale'
                }`}
              >
                {formatLabel(place.status)}
              </span>
              <span className="text-xs font-medium text-muted">
                Last confirmed {formatDate(lastConfirmedAt)}
              </span>
            </div>
            <h2 className="mt-2 text-lg font-semibold text-ink">{place.name}</h2>
            <p className="mt-1 text-sm text-muted">{assets.join(', ')}</p>
          </div>
        </div>

        {expanded ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {primaryClaim?.howToPay ? (
              <section
                className="rounded-card border border-border bg-canvas p-4"
                aria-label="How to pay"
              >
                <h3 className="m-0 text-sm font-semibold text-ink">How to pay</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{primaryClaim.howToPay}</p>
              </section>
            ) : null}

            <dl className="mt-4 grid gap-4 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                  Location
                </dt>
                <dd className="mt-1 font-medium text-ink">{location}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                  Networks
                </dt>
                <dd className="mt-1 font-medium text-ink">
                  {networks.map(formatLabel).join(', ')}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                  Payment routes
                </dt>
                <dd className="mt-1 font-medium text-ink">{routes.map(formatLabel).join(', ')}</dd>
              </div>
              {processors.length > 0 ? (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                    Processor
                  </dt>
                  <dd className="mt-1 font-medium text-ink">
                    {processors.map(formatLabel).join(', ')}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                  Merchant receives
                </dt>
                <dd className="mt-1 font-medium text-ink">
                  {primaryClaim
                    ? formatLabel(primaryClaim.merchantReceives)
                    : 'Not publicly confirmed'}
                </dd>
              </div>
            </dl>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <a
                className="motion-feedback inline-flex min-h-11 items-center justify-center rounded-control bg-brand-600 px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-brand-700"
                href={`/place/${place.placeSlug}`}
              >
                Payment details
              </a>
              <a
                className="motion-feedback inline-flex min-h-11 items-center justify-center rounded-control border border-border px-3 py-2 text-center text-sm font-semibold text-ink no-underline hover:bg-brand-50"
                href={`/report?place=${encodeURIComponent(place.placeSlug)}`}
              >
                Report a problem
              </a>
            </div>
          </div>
        ) : (
          <button
            className="motion-feedback flex min-h-11 w-full shrink-0 items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-brand-700"
            type="button"
            onClick={() => onStateChange('expanded')}
          >
            More payment information
            <ChevronUp className="size-4" aria-hidden="true" />
          </button>
        )}

        {expanded ? (
          <button
            className="motion-feedback flex min-h-11 w-full shrink-0 items-center justify-center gap-2 border-t border-border px-4 py-2 text-sm font-semibold text-muted"
            type="button"
            onClick={() => onStateChange('peek')}
          >
            Show less
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </section>
  );
}
