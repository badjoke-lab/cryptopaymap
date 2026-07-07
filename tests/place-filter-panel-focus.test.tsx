import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaceFilterPanel } from '../src/components/places/PlaceFilterPanel';
import type { PublicPlaceFilterFacets } from '../src/public/places-discovery';
import { defaultDiscoveryUrlState } from '../src/state/discovery-url';

const emptyFacets: PublicPlaceFilterFacets = {
  assets: [],
  networks: [],
  categories: [],
  routes: [],
  statuses: [],
};

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function FilterHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Filters trigger
      </button>
      {open ? (
        <PlaceFilterPanel
          facets={emptyFacets}
          state={defaultDiscoveryUrlState}
          resultCount={1}
          onPatch={() => undefined}
          onClear={() => undefined}
          onWidenArea={() => undefined}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

describe('PlaceFilterPanel mobile focus', () => {
  it('contains Tab focus and restores the trigger after close', () => {
    render(<FilterHarness />);

    const trigger = screen.getByRole('button', { name: 'Filters trigger' });
    trigger.focus();
    fireEvent.click(trigger);

    const panel = screen.getByRole('region', { name: 'Place filters' });
    const panelQueries = within(panel);
    const closeButton = panelQueries.getByRole('button', { name: 'Close filters' });
    const clearButton = panelQueries.getByRole('button', { name: 'Clear' });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(clearButton).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(closeButton).toHaveFocus();

    fireEvent.click(closeButton);
    expect(screen.queryByRole('region', { name: 'Place filters' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
