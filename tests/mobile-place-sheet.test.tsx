import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
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

function SheetHarness() {
  const [state, setState] = useState<BottomSheetState>('peek');
  return <MobilePlaceSheet place={pin} state={state} onStateChange={setState} />;
}

function swipe(handle: HTMLElement, startY: number, endY: number) {
  fireEvent.touchStart(handle, { touches: [{ clientY: startY }] });
  fireEvent.touchMove(handle, { touches: [{ clientY: endY }] });
  fireEvent.touchEnd(handle);
}

describe('MobilePlaceSheet gestures', () => {
  it('expands upward, collapses downward from expanded, and does not close peek on downward swipe', () => {
    render(<SheetHarness />);

    const sheet = screen.getByRole('region', { name: 'Selected place: Example Coffee' });
    expect(sheet).toHaveAttribute('data-sheet-state', 'peek');

    const expandHandle = screen.getByRole('button', { name: 'Expand place details' });
    swipe(expandHandle, 320, 220);
    expect(sheet).toHaveAttribute('data-sheet-state', 'expanded');

    const collapseHandle = screen.getByRole('button', { name: 'Collapse place details' });
    swipe(collapseHandle, 220, 320);
    expect(sheet).toHaveAttribute('data-sheet-state', 'peek');

    const peekHandle = screen.getByRole('button', { name: 'Expand place details' });
    swipe(peekHandle, 220, 320);
    expect(sheet).toHaveAttribute('data-sheet-state', 'peek');
    expect(screen.getByRole('region', { name: 'Selected place: Example Coffee' })).toBeInTheDocument();
  });
});
