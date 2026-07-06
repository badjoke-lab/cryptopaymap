// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readRepositoryFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const pagePaths = [
  'src/pages/about.astro',
  'src/pages/methodology.astro',
  'src/pages/sources-and-licenses.astro',
  'src/pages/data.astro',
];

describe('public trust and data page contract', () => {
  it('provides a shared trust navigation shell', () => {
    const shell = readRepositoryFile('src/components/public/TrustPageShell.astro');

    expect(shell).toContain("{ href: '/about', label: 'About' }");
    expect(shell).toContain("{ href: '/methodology', label: 'Methodology' }");
    expect(shell).toContain("{ href: '/sources-and-licenses', label: 'Sources & Licenses' }");
    expect(shell).toContain("{ href: '/data', label: 'Data' }");
  });

  it('keeps About focused on verified checkout discovery and integrity boundaries', () => {
    const about = readRepositoryFile('src/pages/about.astro');

    expect(about).toContain('verification-focused discovery service');
    expect(about).toContain('Candidate records remain private');
    expect(about).toContain('Verification status is independent from sponsorship');
    expect(about).toContain('Public exports exclude private review material');
  });

  it('publishes the required verification concepts without exposing candidates', () => {
    const methodology = readRepositoryFile('src/pages/methodology.astro');

    expect(methodology).toContain('Class A · Strong');
    expect(methodology).toContain('Class B · Medium');
    expect(methodology).toContain('Class C · Weak');
    expect(methodology).toContain(
      'direct-wallet claim with an unknown network cannot be confirmed',
    );
    expect(methodology).toContain('Candidate');
    expect(methodology).toContain('never appear in public discovery or counts');
  });

  it('keeps database, text, OSM, and media license layers separate', () => {
    const sources = readRepositoryFile('src/pages/sources-and-licenses.astro');

    expect(sources).toContain('ODbL 1.0');
    expect(sources).toContain('ODC-By 1.0');
    expect(sources).toContain('CC BY 4.0');
    expect(sources).toContain('Separate item-level rights basis');
    expect(sources).toContain('© OpenStreetMap contributors');
  });

  it('links only currently materialized artifacts as available now', () => {
    const dataPage = readRepositoryFile('src/pages/data.astro');

    for (const path of [
      '/data/place-pins.json',
      '/data/places.json',
      '/data/online-services.json',
      '/data/stats.json',
      '/data/updates.json',
    ]) {
      expect(dataPage).toContain(`path: '${path}'`);
    }

    expect(dataPage).toContain('A schema-defined path is not represented as available');
    expect(dataPage).toContain('private candidates and review queues');
  });

  it('contains no internal-only document names in public page sources', () => {
    for (const path of pagePaths) {
      const page = readRepositoryFile(path);
      expect(page).not.toContain('CRYPTOPAYMAP_INTERNAL');
      expect(page).not.toContain('Internal Roadmap');
      expect(page).not.toContain('Decision Log');
    }
  });
});
