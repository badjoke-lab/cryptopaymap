import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MobileSiteMenu } from '../src/components/MobileSiteMenu';
import { PlaceResultList } from '../src/components/places/PlaceResultList';
import type { PublicPlacePin } from '../src/public/places-discovery';

const pin: PublicPlacePin = {
  placeSlug: 'compact-cafe-tokyo',
  name: 'Compact Cafe',
  categorySlug: 'cafe',
  countryCode: 'JP',
  locality: 'Tokyo',
  latitude: 35.681236,
  longitude: 139.767125,
  status: 'confirmed',
  assetSlugs: ['bitcoin'],
  networkSlugs: ['lightning'],
  routeTypes: ['direct_wallet'],
  lastConfirmedAt: '2026-07-01T00:00:00Z',
  thumbnail: null,
};

afterEach(() => {
  document.body.style.overflow = '';
  vi.restoreAllMocks();
});

describe('P4-18C C1 mobile density contracts', () => {
  it('keeps all result-card payment summary fields in the compact mobile layout', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    render(
      <PlaceResultList
        pins={[pin]}
        selectedPlace={null}
        scrollOffset={0}
        onScrollOffsetChange={vi.fn()}
        onSelectPlace={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );

    const article = screen.getByRole('heading', { name: 'Compact Cafe' }).closest('article');
    expect(article).not.toBeNull();
    expect(article).toHaveAttribute('data-mobile-density', 'compact');

    const summary = article?.querySelector('[data-mobile-summary-grid="two-column"]');
    expect(summary).not.toBeNull();
    expect(within(summary as HTMLElement).getByText('Bitcoin')).toBeInTheDocument();
    expect(within(summary as HTMLElement).getByText('Lightning')).toBeInTheDocument();
    expect(within(summary as HTMLElement).getByText('Direct Wallet')).toBeInTheDocument();
    expect(within(summary as HTMLElement).getByText('Jul 1, 2026')).toBeInTheDocument();
    expect(within(article as HTMLElement).getByRole('button', { name: /Select Compact Cafe/ })).toBeInTheDocument();
    expect(within(article as HTMLElement).getByRole('link', { name: 'Payment details' })).toHaveAttribute(
      'href',
      '/place/compact-cafe-tokyo',
    );
  });

  it('opens a bounded two-column mobile menu and preserves Escape close behavior', async () => {
    const user = userEvent.setup();
    render(<MobileSiteMenu pathname="/places" />);

    const trigger = screen.getByRole('button', { name: 'Menu' });
    await user.click(trigger);

    const menu = screen.getByLabelText('Mobile primary');
    expect(menu).toHaveAttribute('data-mobile-menu-layout', 'bounded-panel');
    expect(menu.querySelector('[data-mobile-menu-grid="two-column"]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Places' })).toHaveAttribute('aria-current', 'page');
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');
    expect(menu).toHaveAttribute('aria-hidden', 'true');
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });
});
