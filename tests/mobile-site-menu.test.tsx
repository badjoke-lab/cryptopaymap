import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileSiteMenu } from '../src/components/MobileSiteMenu';

beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  document.body.style.overflow = '';
  vi.restoreAllMocks();
});

describe('MobileSiteMenu', () => {
  it('keeps closed links inert and contains focus while open', () => {
    render(<MobileSiteMenu pathname="/places" />);

    const trigger = screen.getByRole('button', { name: 'Menu' });
    const menu = screen.getByRole('complementary', { name: 'Mobile primary', hidden: true });
    expect(menu).toHaveAttribute('inert');

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(menu).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');

    const menuQueries = within(menu);
    const closeButton = menuQueries.getByRole('button', { name: 'Close menu' });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(menuQueries.getByRole('link', { name: 'Support' })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
    expect(trigger).toHaveFocus();
  });
});
