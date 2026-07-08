import { ChevronDown, ChevronUp, ExternalLink, MapPinned, Phone, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildPlaceDetailModel, type PublicPlace } from '../../public/place-detail';
import type { PublicPlacePin } from '../../public/places-discovery';
import type { BottomSheetState } from '../../state/discovery-store';
import { PlaceMediaGallery } from './PlaceMediaGallery';
import { buildPlaceNavigationLinks } from './place-navigation';

interface MobilePlaceSheetProps {
  place: PublicPlacePin | null;
  detail?: PublicPlace | null;
  state: BottomSheetState;
  onStateChange: (state: BottomSheetState) => void;
  onClose?: () => void;
}

const swipeThreshold = 48;
const peekOffsetDvh = 53;

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

export function MobilePlaceSheet({
  place,
  detail = null,
  state,
  onStateChange,
  onClose,
}: MobilePlaceSheetProps) {
  const touchStartY = useRef<number | null>(null);
  const touchCurrentY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [enteredSlug, setEnteredSlug] = useState<string | null>(null);
  const detailModel = useMemo(() => (detail ? buildPlaceDetailModel(detail) : null), [detail]);
  const placeSlug = place?.placeSlug ?? null;

  useEffect(() => {
    if (!placeSlug || state === 'closed') {
      setEnteredSlug(null);
      return;
    }
    const frame = window.requestAnimationFrame(() => setEnteredSlug(placeSlug));
    return () => window.cancelAnimationFrame(frame);
  }, [placeSlug, state]);

  if (!place || state === 'closed') return null;

  const entered = enteredSlug === place.placeSlug;
  const expanded = state === 'expanded';
  const profile = detailModel?.place ?? null;
  const primaryClaim = detailModel?.claims[0] ?? null;
  const compactLocation = [place.locality, place.countryCode].filter(Boolean).join(', ');
  const location = detailModel?.address || compactLocation;
  const networks = detailModel?.networkSlugs ?? place.networkSlugs;
  const routes = detailModel
    ? [...new Set(detailModel.claims.map((claim) => claim.routeType))]
    : place.routeTypes;
  const paymentMethods = detailModel
    ? [
        ...new Set(
          detailModel.claims.flatMap((claim) =>
            claim.paymentAssets.map((payment) => payment.paymentMethod),
          ),
        ),
      ]
    : [];
  const processors = detailModel
    ? [
        ...new Set(
          detailModel.claims
            .map((claim) => claim.processorSlug)
            .filter((processor): processor is string => processor !== null),
        ),
      ]
    : [];
  const restrictions = detailModel
    ? [
        ...new Set(
          detailModel.claims
            .map((claim) => claim.restrictions)
            .filter((restriction): restriction is string => restriction !== null),
        ),
      ]
    : [];
  const assets = detailModel?.assetSymbols ?? place.assetSlugs.map(formatLabel);
  const amenities = profile?.amenities ?? [];
  const socialLinks = profile?.socialLinks ?? [];
  const galleryImages = detailModel
    ? detailModel.cover
      ? [detailModel.cover, ...detailModel.gallery]
      : detailModel.gallery
    : [];
  const navigation = buildPlaceNavigationLinks({
    latitude: place.latitude,
    longitude: place.longitude,
  });
  const lastConfirmedAt = detailModel?.lastConfirmedAt ?? place.lastConfirmedAt;
  const baseOffsetDvh = expanded ? 0 : peekOffsetDvh;
  const transform = entered
    ? `translateY(calc(${baseOffsetDvh}dvh + ${dragOffsetY}px))`
    : 'translateY(88dvh)';

  function closeSheet() {
    if (onClose) onClose();
    else onStateChange('closed');
  }

  function resetDrag() {
    touchStartY.current = null;
    touchCurrentY.current = null;
    setDragOffsetY(0);
    setDragging(false);
  }

  function handleTouchStart(event: React.TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartY.current = touch.clientY;
    touchCurrentY.current = touch.clientY;
    setDragOffsetY(0);
    setDragging(true);
  }

  function handleTouchMove(event: React.TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    if (!touch || touchStartY.current === null) return;
    touchCurrentY.current = touch.clientY;
    const deltaY = touch.clientY - touchStartY.current;
    const transitionDistance = window.innerHeight * (peekOffsetDvh / 100);
    const boundedOffset = expanded
      ? Math.min(Math.max(deltaY, 0), transitionDistance)
      : Math.max(Math.min(deltaY, 0), -transitionDistance);
    setDragOffsetY(boundedOffset);
  }

  function handleTouchEnd() {
    if (touchStartY.current === null || touchCurrentY.current === null) {
      resetDrag();
      return;
    }

    const deltaY = touchCurrentY.current - touchStartY.current;
    if (deltaY < -swipeThreshold && !expanded) {
      onStateChange('expanded');
    } else if (deltaY > swipeThreshold && expanded) {
      onStateChange('peek');
    }
    resetDrag();
  }

  return (
    <section
      className={`fixed inset-x-0 bottom-0 z-40 flex h-[88dvh] flex-col rounded-t-card border-x border-t border-border bg-surface shadow-panel motion-reduce:transition-none lg:hidden ${
        dragging ? 'transition-none' : 'transition-transform duration-normal ease-standard'
      }`}
      style={{ transform }}
      aria-label={`Selected place: ${place.name}`}
      data-sheet-state={state}
      data-sheet-dragging={dragging ? 'true' : 'false'}
      data-sheet-entered={entered ? 'true' : 'false'}
    >
      <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
        <div
          className="relative shrink-0 touch-none border-b border-border px-4 pb-3 pt-2"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={resetDrag}
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
            <p className="mt-1 text-sm text-muted">
              {formatLabel(place.categorySlug)}
              {compactLocation ? ` · ${compactLocation}` : ''}
            </p>
            <p className="mt-1 text-sm font-medium text-ink">{assets.join(', ')}</p>
          </div>
        </div>

        {expanded ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {location ? (
              <section aria-label="Location">
                <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                  Location
                </h3>
                <p className="mt-1 text-sm leading-6 text-ink">{location}</p>
              </section>
            ) : null}

            <section className="mt-4" aria-label="Navigate">
              <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                Navigate
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  className="motion-feedback inline-flex min-h-10 items-center gap-2 rounded-control border border-border px-3 py-2 text-sm font-semibold text-ink no-underline"
                  href={navigation.googleMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPinned className="size-4" aria-hidden="true" />
                  Google Maps
                </a>
                <a
                  className="motion-feedback inline-flex min-h-10 items-center gap-2 rounded-control border border-border px-3 py-2 text-sm font-semibold text-ink no-underline"
                  href={navigation.appleMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPinned className="size-4" aria-hidden="true" />
                  Apple Maps
                </a>
              </div>
            </section>

            <section
              className="mt-4"
              aria-label="Payment information"
              data-payment-priority="primary"
            >
              {primaryClaim?.howToPay ? (
                <section
                  className="rounded-card border border-brand-200 bg-brand-50 p-4"
                  aria-label="How to pay"
                >
                  <h3 className="m-0 text-sm font-semibold text-ink">How to pay</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{primaryClaim.howToPay}</p>
                </section>
              ) : null}

              <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 text-sm">
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
                  <dd className="mt-1 font-medium text-ink">
                    {routes.map(formatLabel).join(', ')}
                  </dd>
                </div>
                {paymentMethods.length > 0 ? (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                      Payment methods
                    </dt>
                    <dd className="mt-1 font-medium text-ink">
                      {paymentMethods.map(formatLabel).join(', ')}
                    </dd>
                  </div>
                ) : null}
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

              {restrictions.length > 0 ? (
                <section className="mt-4" aria-label="Payment restrictions">
                  <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                    Restrictions
                  </h3>
                  {restrictions.map((restriction) => (
                    <p className="mt-1 text-sm leading-6 text-muted" key={restriction}>
                      {restriction}
                    </p>
                  ))}
                </section>
              ) : null}
            </section>

            {profile?.description ? (
              <section className="mt-5 border-t border-border pt-4" aria-label="About this place">
                <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                  About
                </h3>
                <p className="mt-1 text-sm leading-6 text-muted">{profile.description}</p>
              </section>
            ) : null}

            {profile?.openingHours ? (
              <section className="mt-4" aria-label="Opening hours">
                <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                  Hours
                </h3>
                <p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink">
                  {profile.openingHours}
                </p>
              </section>
            ) : null}

            {amenities.length > 0 ? (
              <section className="mt-4" aria-label="Amenities">
                <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                  Amenities
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {amenities.map((amenity) => (
                    <span
                      className="rounded-pill border border-border bg-canvas px-2.5 py-1 text-xs font-medium text-ink"
                      key={amenity}
                    >
                      {formatLabel(amenity)}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {profile && (profile.phone || profile.websiteUrl || socialLinks.length > 0) ? (
              <section className="mt-4" aria-label="Contact and official links">
                <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                  Contact and official links
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {profile.phone ? (
                    <a
                      className="motion-feedback inline-flex min-h-10 items-center gap-2 rounded-control border border-border px-3 py-2 text-sm font-semibold text-ink no-underline"
                      href={`tel:${profile.phone}`}
                    >
                      <Phone className="size-4" aria-hidden="true" />
                      {profile.phone}
                    </a>
                  ) : null}
                  {profile.websiteUrl ? (
                    <a
                      className="motion-feedback inline-flex min-h-10 items-center gap-2 rounded-control border border-border px-3 py-2 text-sm font-semibold text-ink no-underline"
                      href={profile.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Website
                      <ExternalLink className="size-4" aria-hidden="true" />
                    </a>
                  ) : null}
                  {socialLinks.map((link) => (
                    <a
                      className="motion-feedback inline-flex min-h-10 items-center gap-2 rounded-control border border-border px-3 py-2 text-sm font-semibold text-ink no-underline"
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      key={`${link.platform}:${link.url}`}
                    >
                      {link.handle ?? formatLabel(link.platform)}
                      <ExternalLink className="size-4" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            {galleryImages.length > 0 ? (
              <div className="mt-4">
                <PlaceMediaGallery images={galleryImages} />
              </div>
            ) : null}

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
            More place information
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
