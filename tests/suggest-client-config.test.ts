import { describe, expect, it } from 'vitest';
import {
  readSuggestClientConfigurationFromEnvironment,
  SuggestClientConfigurationError,
} from '../src/submissions/suggest-client-config';

const validEnvironment = {
  CPM_TURNSTILE_SECRET_KEY: 'server-secret',
  PUBLIC_TURNSTILE_SITE_KEY: 'public-site-key',
  CPM_TURNSTILE_EXPECTED_HOSTNAME: 'review.example.test',
  CPM_TURNSTILE_EXPECTED_ACTION: 'submission_intake',
};

describe('P5-02Q client-safe Suggest runtime configuration', () => {
  it('returns only the public site key and action', () => {
    const configuration = readSuggestClientConfigurationFromEnvironment(validEnvironment);

    expect(configuration).toEqual({
      siteKey: 'public-site-key',
      action: 'submission_intake',
    });
    expect(JSON.stringify(configuration)).not.toContain('server-secret');
    expect(JSON.stringify(configuration)).not.toContain('review.example.test');
  });

  it('fails closed with one generic error for missing server configuration', () => {
    expect(() =>
      readSuggestClientConfigurationFromEnvironment({
        ...validEnvironment,
        CPM_TURNSTILE_SECRET_KEY: undefined,
      }),
    ).toThrow(SuggestClientConfigurationError);
    expect(() =>
      readSuggestClientConfigurationFromEnvironment({
        ...validEnvironment,
        CPM_TURNSTILE_SECRET_KEY: undefined,
      }),
    ).toThrow('Suggest client configuration is unavailable.');
  });
});
