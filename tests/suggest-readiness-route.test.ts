import { describe, expect, it } from 'vitest';
import { onRequestGet } from '../functions/api/suggest/readiness';
import type { SuggestConfiguredReadinessEnvironment } from '../src/submissions/suggest-configured-readiness';

const readinessToken = 'R'.repeat(48);

function createContext(authorization: string, env: SuggestConfiguredReadinessEnvironment) {
  return {
    request: new Request('https://review.example.test/api/suggest/readiness', {
      headers: { Authorization: authorization },
    }),
    env,
  };
}

describe('configured Suggest readiness route', () => {
  it('keeps unauthorized readiness diagnostics hidden behind 404', async () => {
    const response = await onRequestGet(
      createContext('Bearer wrong-token', {
        CPM_SUGGEST_READINESS_TOKEN: readinessToken,
      } as SuggestConfiguredReadinessEnvironment),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not_found' });
  });

  it('returns only a bounded failure stage after valid bearer authorization', async () => {
    const response = await onRequestGet(
      createContext('Bearer ' + readinessToken, {
        CPM_SUGGEST_READINESS_TOKEN: readinessToken,
      } as SuggestConfiguredReadinessEnvironment),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ready: false,
      failureStage: 'runtime_configuration',
    });
  });
});
