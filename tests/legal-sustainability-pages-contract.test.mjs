// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readRepositoryFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const publicPolicyPages = [
  'src/pages/privacy.astro',
  'src/pages/terms.astro',
  'src/pages/disclaimer.astro',
  'src/pages/contact.astro',
  'src/pages/support.astro',
  'src/pages/partners.astro',
];

describe('public legal and sustainability page contract', () => {
  it('provides shared policy navigation for all six routes', () => {
    const shell = readRepositoryFile('src/components/public/PolicyPageShell.astro');

    for (const route of ['/privacy', '/terms', '/disclaimer', '/contact', '/support', '/partners']) {
      expect(shell).toContain(`href: '${route}'`);
    }
  });

  it('states the privacy minimization and private-evidence boundary', () => {
    const privacy = readRepositoryFile('src/pages/privacy.astro');

    expect(privacy).toContain('does not create a persistent user profile');
    expect(privacy).toContain('Precise location history is not stored');
    expect(privacy).toContain('Private evidence stays private');
    expect(privacy).toContain('not repurposed into advertising profiles or sold as personal data');
    expect(privacy).toContain('Delete the object 30 days after submission closure');
    expect(privacy).toContain('Delete 180 days after final resolution');
    expect(privacy).toContain('Delete 90 days after completion');
  });

  it('keeps contribution review and media rights explicit in Terms', () => {
    const terms = readRepositoryFile('src/pages/terms.astro');

    expect(terms).toContain('does not guarantee publication');
    expect(terms).toContain('does not automatically authorize public gallery display');
    expect(terms).toContain('non-exclusive, worldwide, royalty-free permission');
    expect(terms).toContain('The contributor retains ownership');
    expect(terms).toContain('Publication decisions are based on the verification and source policies');
  });

  it('states freshness, coverage, transaction, and non-advisory limitations', () => {
    const disclaimer = readRepositoryFile('src/pages/disclaimer.astro');

    expect(disclaimer).toContain('not a guarantee that a payment will succeed');
    expect(disclaimer).toContain('No financial, investment, tax, or legal advice');
    expect(disclaimer).toContain('CryptoPayMap does not custody customer funds');
    expect(disclaimer).toContain('CryptoPayMap published dataset, not the entire global');
  });

  it('keeps public project contact separate from private evidence', () => {
    const contact = readRepositoryFile('src/pages/contact.astro');

    expect(contact).toContain('https://github.com/badjoke-lab/cryptopaymap/issues');
    expect(contact).toContain('Do not post receipts, wallet addresses, transaction URLs');
    expect(contact).toContain('The project will publish a private contact method before private contribution intake opens');
    expect(contact).toContain('Available when the corresponding public submission workflow is enabled');
  });

  it('keeps support and partnerships independent from verification', () => {
    const support = readRepositoryFile('src/pages/support.astro');
    const partners = readRepositoryFile('src/pages/partners.astro');

    expect(support).toContain('Verification cannot be purchased');
    expect(support).toContain('No ranking advantage');
    expect(support).toContain('No support payment method is currently published');
    expect(partners).toContain('Verification remains independent');
    expect(partners).toContain('A partner cannot purchase confirmed status');
    expect(partners).toContain('Sponsored presentation, if introduced, is visibly labeled');
  });

  it('exposes the completed policy and sustainability routes from the footer', () => {
    const footer = readRepositoryFile('src/components/SiteFooter.astro');

    for (const route of ['/privacy', '/terms', '/disclaimer', '/contact', '/support', '/partners']) {
      expect(footer).toContain(`href: '${route}'`);
    }
  });

  it('does not expose internal-only document names', () => {
    for (const path of publicPolicyPages) {
      const page = readRepositoryFile(path);
      expect(page).not.toContain('CRYPTOPAYMAP_INTERNAL');
      expect(page).not.toContain('Internal Roadmap');
      expect(page).not.toContain('Decision Log');
    }
  });
});
