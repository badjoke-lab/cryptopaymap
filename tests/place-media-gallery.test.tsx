import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlaceMediaGallery } from '../src/components/places/PlaceMediaGallery';
import type { PublicPlace } from '../src/public/place-detail';

const images: PublicPlace['media'] = [
  {
    role: 'cover',
    url: 'https://media.example.com/exterior.webp',
    mimeType: 'image/webp',
    width: 1200,
    height: 800,
    altText: 'Exterior of Example Coffee.',
    attribution: null,
    licenseSlug: null,
  },
  {
    role: 'interior',
    url: 'https://media.example.com/interior.webp',
    mimeType: 'image/webp',
    width: 1200,
    height: 800,
    altText: 'Interior seating at Example Coffee.',
    attribution: null,
    licenseSlug: null,
  },
];

describe('PlaceMediaGallery', () => {
  it('opens an enlarged image, supports next/previous keys, Escape, and focus restoration', async () => {
    render(<PlaceMediaGallery images={images} />);

    const firstThumbnail = screen.getByRole('button', {
      name: /Enlarge image 1 of 2: Exterior of Example Coffee/,
    });
    firstThumbnail.focus();
    fireEvent.click(firstThumbnail);

    expect(
      screen.getByRole('dialog', { name: 'Image viewer: Exterior of Example Coffee.' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Close image viewer' })[1]).toHaveFocus(),
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(
      screen.getByRole('dialog', { name: 'Image viewer: Interior seating at Example Coffee.' }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(
      screen.getByRole('dialog', { name: 'Image viewer: Exterior of Example Coffee.' }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(firstThumbnail).toHaveFocus();
  });

  it('supports horizontal touch swipe navigation in the enlarged viewer', () => {
    render(<PlaceMediaGallery images={images} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: /Enlarge image 1 of 2: Exterior of Example Coffee/,
      }),
    );

    const dialog = screen.getByRole('dialog', {
      name: 'Image viewer: Exterior of Example Coffee.',
    });
    const firstImage = within(dialog).getByAltText('Exterior of Example Coffee.');
    fireEvent.touchStart(firstImage, { touches: [{ clientX: 300 }] });
    fireEvent.touchMove(firstImage, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(firstImage);

    expect(
      screen.getByRole('dialog', { name: 'Image viewer: Interior seating at Example Coffee.' }),
    ).toBeInTheDocument();
  });
});
