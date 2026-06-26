// @vitest-environment node

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readRepositoryFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('PWA installability baseline', () => {
  it('defines a scoped standalone web app manifest', () => {
    const manifest = JSON.parse(readRepositoryFile('public/manifest.webmanifest'));

    expect(manifest.id).toBe('/');
    expect(manifest.name).toBe('CryptoPayMap');
    expect(manifest.short_name).toBe('CryptoPayMap');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#0f766e');
    expect(manifest.background_color).toBe('#f8fafc');
  });

  it('provides standard and maskable application icons', () => {
    const manifest = JSON.parse(readRepositoryFile('public/manifest.webmanifest'));

    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: '/icons/cryptopaymap.svg',
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any',
        }),
        expect.objectContaining({
          src: '/icons/cryptopaymap-maskable.svg',
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'maskable',
        }),
      ]),
    );
  });

  it('links installability metadata from the shared document head', () => {
    const layout = readRepositoryFile('src/layouts/BaseLayout.astro');

    expect(layout).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(layout).toContain('rel="icon" href="/icons/cryptopaymap.svg"');
    expect(layout).toContain('name="theme-color" content="#0f766e"');
    expect(layout).toContain('name="mobile-web-app-capable" content="yes"');
  });

  it('does not introduce an offline cache for payment data', () => {
    const serviceWorkerPath = new URL('../public/sw.js', import.meta.url);
    const layout = readRepositoryFile('src/layouts/BaseLayout.astro');

    expect(existsSync(serviceWorkerPath)).toBe(false);
    expect(layout).not.toContain('serviceWorker.register');
    expect(layout).not.toContain('caches.open');
  });
});
