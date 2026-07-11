import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfiguredSuggestForm } from '../src/components/submissions/ConfiguredSuggestForm';

const turnstile = {
  render: vi.fn(
    (
      _container: HTMLElement,
      options: {
        callback(token: string): void;
      },
    ) => {
      options.callback('runtime-token');
      return 'widget-1';
    },
  ),
  reset: vi.fn(),
  remove: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'turnstile');
  turnstile.render.mockClear();
  turnstile.reset.mockClear();
  turnstile.remove.mockClear();
});

function renderConfiguredForm() {
  Object.defineProperty(window, 'turnstile', {
    configurable: true,
    value: turnstile,
  });
  return render(
    <ConfiguredSuggestForm
      assets={[{ value: 'bitcoin', label: 'BTC — Bitcoin' }]}
      networks={[{ value: 'lightning', label: 'Lightning Network' }]}
    />,
  );
}

describe('P5-02Q runtime-configured Suggest form', () => {
  it('loads same-origin client-safe configuration before rendering Turnstile', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ siteKey: 'public-site-key', action: 'submission_intake' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderConfiguredForm();

    expect(screen.getByText('Preparing the secure submission form')).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Submit suggestion' });
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/suggest/config',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
    expect(turnstile.render.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        sitekey: 'public-site-key',
        action: 'submission_intake',
      }),
    );
  });

  it('fails closed when runtime configuration cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unavailable', { status: 503 })),
    );

    renderConfiguredForm();

    await screen.findByText('Suggestion form unavailable');
    expect(screen.queryByRole('button', { name: 'Submit suggestion' })).not.toBeInTheDocument();
  });

  it('fails closed on malformed client configuration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ siteKey: 'public-site-key', action: 'invalid action' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    renderConfiguredForm();

    await screen.findByText('Suggestion form unavailable');
    expect(turnstile.render).not.toHaveBeenCalled();
  });
});
