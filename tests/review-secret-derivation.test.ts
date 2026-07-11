import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];
const scriptPath = join(process.cwd(), 'scripts/derive-suggest-review-secrets.mjs');
const canonicalSeed = Buffer.alloc(32, 7).toString('base64url');

function derive(outputName: string, seed = canonicalSeed) {
  const directory = mkdtempSync(join(tmpdir(), 'cpm-review-secrets-'));
  temporaryDirectories.push(directory);
  const outputPath = join(directory, outputName);
  execFileSync(process.execPath, [scriptPath, outputPath], {
    env: {
      ...process.env,
      CPM_REVIEW_SECRET_SEED_BASE64URL: seed,
    },
    stdio: 'pipe',
  });
  return JSON.parse(readFileSync(outputPath, 'utf8')) as Record<string, string>;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop() as string, { recursive: true, force: true });
  }
});

describe('P5-02Q stable review secret derivation', () => {
  it('derives deterministic, canonical, domain-separated values from one seed', () => {
    const first = derive('first.json');
    const second = derive('second.json');

    expect(first).toEqual(second);
    expect(Object.keys(first).sort()).toEqual(
      [
        'CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL',
        'CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL',
        'CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL',
        'CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL',
        'CPM_SUGGEST_READINESS_TOKEN',
      ].sort(),
    );

    const keyValues = Object.entries(first)
      .filter(([name]) => name.endsWith('_BASE64URL'))
      .map(([, value]) => value);
    expect(new Set(keyValues).size).toBe(4);
    for (const value of keyValues) {
      expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(value, 'base64url')).toHaveLength(32);
      expect(Buffer.from(value, 'base64url').toString('base64url')).toBe(value);
    }
    expect(first.CPM_SUGGEST_READINESS_TOKEN).toMatch(/^cpmrv_[A-Za-z0-9_-]{43}$/);
  });

  it('changes every derived value when the root seed changes', () => {
    const first = derive('first.json', Buffer.alloc(32, 7).toString('base64url'));
    const second = derive('second.json', Buffer.alloc(32, 8).toString('base64url'));

    for (const key of Object.keys(first)) {
      expect(second[key]).not.toBe(first[key]);
    }
  });

  it.each([
    ['missing seed', undefined],
    ['non-canonical seed', `${canonicalSeed}=`],
    ['short seed', Buffer.alloc(16, 7).toString('base64url')],
  ])('rejects %s', (_name, seed) => {
    const directory = mkdtempSync(join(tmpdir(), 'cpm-review-secrets-invalid-'));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, 'invalid.json');
    const environment = { ...process.env };
    if (seed === undefined) {
      delete environment.CPM_REVIEW_SECRET_SEED_BASE64URL;
    } else {
      environment.CPM_REVIEW_SECRET_SEED_BASE64URL = seed;
    }

    expect(() =>
      execFileSync(process.execPath, [scriptPath, outputPath], {
        env: environment,
        stdio: 'pipe',
      }),
    ).toThrow();
  });
});
