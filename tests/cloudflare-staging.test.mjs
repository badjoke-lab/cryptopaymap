// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readRepositoryFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('Cloudflare staging foundation', () => {
  it('defines a static Pages project without embedded credentials', () => {
    const configText = readRepositoryFile('wrangler.jsonc');
    const config = JSON.parse(configText);

    expect(config.name).toBe('cryptopaymap-staging');
    expect(config.pages_build_output_dir).toBe('./dist');
    expect(config.compatibility_date).toBe('2026-06-26');
    expect(configText).not.toContain('DATABASE_URL');
    expect(configText).not.toContain('CLOUDFLARE_API_TOKEN');
    expect(configText).not.toContain('CLOUDFLARE_ACCOUNT_ID');
  });

  it('defines baseline security and cache headers', () => {
    const headers = readRepositoryFile('public/_headers');

    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('X-Frame-Options: DENY');
    expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(headers).toContain('Permissions-Policy:');
    expect(headers).toContain('Cache-Control: public, max-age=31556952, immutable');
    expect(headers).toContain('Cache-Control: public, max-age=300, must-revalidate');
  });

  it('keeps deployment manual and scoped to the staging environment', () => {
    const workflow = readRepositoryFile('.github/workflows/staging-deploy.yml');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('environment: staging');
    expect(workflow).toContain('cryptopaymap-staging');
    expect(workflow).toContain('--branch staging');
    expect(workflow).toContain('secrets.CLOUDFLARE_API_TOKEN');
    expect(workflow).toContain('secrets.CLOUDFLARE_ACCOUNT_ID');
    expect(workflow).not.toContain('\n  push:');
  });
});
