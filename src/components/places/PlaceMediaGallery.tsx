import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PublicPlace } from '../../public/place-detail';

interface PlaceMediaGalleryProps {
  images: PublicPlace['media'];
  label?: string;
}

const swipeThreshold = 48;
const focusableSelector =
  'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function PlaceMediaGallery({ images, label = 'Gallery' }: PlaceMediaGalleryProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);
  const imageSetKey = images.map((image) => image.url).join('\n');
  const previousImageSetKeyRef = useRef(imageSetKey);
  const open = activeIndex !== null;

  useEffect(() => {
    if (previousImageSetKeyRef.current === imageSetKey) return;
    previousImageSetKeyRef.current = imageSetKey;
    setActiveIndex(null);
  }, [imageSetKey]);

  useEffect(() => {
    if (!open) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveIndex(null);
        return;
      }
      if (event.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
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
        const focusOutsideDialog = !activeElement || !dialog.contains(activeElement);
        if (event.shiftKey && (activeElement === first || focusOutsideDialog)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (activeElement === last || focusOutsideDialog)) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key === 'ArrowRight' && images.length > 1) {
        setActiveIndex((current) => (current === null ? null : (current + 1) % images.length));
      }
      if (event.key === 'ArrowLeft' && images.length > 1) {
        setActiveIndex((current) =>
          current === null ? null : (current - 1 + images.length) % images.length,
        );
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus();
    };
  }, [images.length, open]);

  if (images.length === 0) return null;

  const activeImage = activeIndex === null ? null : images[activeIndex];

  function showPrevious() {
    setActiveIndex((current) =>
      current === null ? null : (current - 1 + images.length) % images.length,
    );
  }

  function showNext() {
    setActiveIndex((current) => (current === null ? null : (current + 1) % images.length));
  }

  function handleTouchStart(event: React.TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartX.current = touch.clientX;
    touchCurrentX.current = touch.clientX;
  }

  function handleTouchMove(event: React.TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    if (!touch || touchStartX.current === null) return;
    touchCurrentX.current = touch.clientX;
  }

  function handleTouchEnd() {
    if (touchStartX.current === null || touchCurrentX.current === null) return;
    const deltaX = touchCurrentX.current - touchStartX.current;
    if (deltaX < -swipeThreshold && images.length > 1) showNext();
    if (deltaX > swipeThreshold && images.length > 1) showPrevious();
    touchStartX.current = null;
    touchCurrentX.current = null;
  }

  return (
    <section aria-label={label}>
      <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-muted">{label}</h3>
      <div className="mt-2 flex snap-x gap-2 overflow-x-auto pb-2">
        {images.map((image, index) => (
          <button
            className="motion-feedback relative aspect-[4/3] w-40 shrink-0 snap-start overflow-hidden rounded-card border border-border bg-canvas"
            type="button"
            aria-label={`Enlarge image ${index + 1} of ${images.length}: ${image.altText}`}
            onClick={() => setActiveIndex(index)}
            key={image.url}
          >
            <img
              className="h-full w-full object-cover"
              src={image.url}
              alt={image.altText}
              width={image.width}
              height={image.height}
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {activeImage ? (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Image viewer: ${activeImage.altText}`}
        >
          <button
            className="absolute inset-0 bg-black/85"
            type="button"
            tabIndex={-1}
            aria-label="Close image viewer"
            onClick={() => setActiveIndex(null)}
          />
          <div className="relative z-10 flex max-h-full w-full max-w-6xl flex-col items-center justify-center">
            <button
              ref={closeButtonRef}
              className="motion-feedback absolute right-0 top-0 z-20 flex size-11 items-center justify-center rounded-full bg-surface text-ink shadow-panel"
              type="button"
              aria-label="Close image viewer"
              onClick={() => setActiveIndex(null)}
            >
              <X className="size-5" aria-hidden="true" />
            </button>

            <figure
              className="m-0 flex max-h-[calc(100dvh-6rem)] w-full touch-pan-y flex-col items-center justify-center"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={() => {
                touchStartX.current = null;
                touchCurrentX.current = null;
              }}
            >
              <img
                className="max-h-[calc(100dvh-9rem)] max-w-full rounded-card object-contain"
                src={activeImage.url}
                alt={activeImage.altText}
                width={activeImage.width}
                height={activeImage.height}
              />
              <figcaption className="mt-3 rounded-card bg-black/70 px-3 py-2 text-center text-sm text-white">
                <span className="block">
                  {(activeIndex ?? 0) + 1} / {images.length} · {activeImage.altText}
                </span>
                {activeImage.attribution ? (
                  <span className="mt-1 block text-xs text-white/80">
                    {activeImage.attribution}
                  </span>
                ) : null}
              </figcaption>
            </figure>

            {images.length > 1 ? (
              <>
                <button
                  className="motion-feedback absolute left-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-ink shadow-panel"
                  type="button"
                  aria-label="Previous image"
                  onClick={showPrevious}
                >
                  <ChevronLeft className="size-6" aria-hidden="true" />
                </button>
                <button
                  className="motion-feedback absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-ink shadow-panel"
                  type="button"
                  aria-label="Next image"
                  onClick={showNext}
                >
                  <ChevronRight className="size-6" aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
