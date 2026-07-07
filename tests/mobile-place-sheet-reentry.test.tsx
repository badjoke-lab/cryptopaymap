import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobilePlaceSheet } from '../src/components/places/MobilePlaceSheet';
import type { PublicPlacePin } from '../src/public/places-discovery';
import type { BottomSheetState } from '../src/state/discovery-store';

const pin: PublicPlacePin = {
  placeSlug: 'example-coffee-tokyo',
  name: 'Example Coffee',
  categorySlug: 'cafe',
  countryCode: 'JP',
  locality: 'Tokyo',
  latitude: 35.681236,
  longitude: 139.767125,
  status: 'confirmed',
  assetSlugs: ['bitcoin'],
  networkSlugs: ['lightning'],
  routeTypes: ['direct_wallet'],
  lastConfirmedAt: '2026-06-20T00:00:00Z',
  thumbnail: null,
};

let pendingFrame: FrameRequestCallback | null = null;

beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    pendingFrame = callback;
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  pendingFrame = null;
  vi.restoreAllMocks();
});

function settleEntry() {
  const callback = pendingFrame;
  pendingFrame = null;
  if (!callback) throw new Error('Expected a pending sheet entry frame.');
  act(() => callback(0));
}

function ReentryHarness() {
  const [place, setPlace] = useState<PublicPlacePin | null>(pin);
  const [state, setState] = useState<BottomSheetState>('peek');

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setPlace(pin);
          setState('peek');
        }}
      >
        Show same place
      </button>
      <MobilePlaceSheet
        place={place}
        state={state}
        onStateChange={setState}
        onClose={() => {
          setPlace(null);
          setState('closed');
        }}
      />
    </>
  );
}

describe('MobilePlaceSheet reentry', () => {
  it('restarts the entry cycle after closing and reopening the same Place', () => {
    render(<ReentryHarness />);

    settleEntry();
    const firstSheet = screen.getByRole('region', { name: 'Selected place: Example Coffee' });
    expect(firstSheet).toHaveAttribute('data-sheet-entered', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Close selected place' }));
    expect(
      screen.queryByRole('region', { name: 'Selected place: Example Coffee' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show same place' }));
    const reopenedSheet = screen.getByRole('region', { name: 'Selected place: Example Coffee' });
    expect(reopenedSheet).toHaveAttribute('data-sheet-entered', 'false');
    expect(reopenedSheet.style.transform).toBe('translateY(88dvh)');

    settleEntry();
    expect(reopenedSheet).toHaveAttribute('data-sheet-entered', 'true');
    expect(reopenedSheet.style.transform).toContain('53dvh');
  });
});
