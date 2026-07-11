import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SuggestForm } from '../src/components/submissions/SuggestForm';

const turnstile = {
  render: vi.fn(
    (
      _container: HTMLElement,
      options: {
        callback(token: string): void;
      },
    ) => {
      options.callback('turnstile-browser-token');
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

function renderForm() {
  Object.defineProperty(window, 'turnstile', {
    configurable: true,
    value: turnstile,
  });
  return render(
    <SuggestForm
      siteKey="public-site-key"
      action="submission_intake"
      assets={[{ value: 'bitcoin', label: 'BTC — Bitcoin' }]}
      networks={[{ value: 'lightning', label: 'Lightning Network' }]}
    />,
  );
}

describe('P5-02P public Suggest form', () => {
  it('renders Turnstile explicitly with the configured site key and action', async () => {
    renderForm();

    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
    expect(turnstile.render.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        sitekey: 'public-site-key',
        action: 'submission_intake',
        theme: 'light',
        size: 'flexible',
      }),
    );
  });

  it('submits the strict Suggest HTTP envelope and renders the private receipt', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
      expect(new Headers(init?.headers).get('Idempotency-Key')).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.challengeToken).toBe('turnstile-browser-token');
      expect(body.submission).toEqual(
        expect.objectContaining({
          schemaVersion: 'submission-common-v1',
          submissionType: 'suggest',
          targetType: null,
          targetId: null,
        }),
      );
      return new Response(
        JSON.stringify({
          submissionReference: 'CPM-S-2026-000123',
          statusSecret: 'cpmss_private-secret',
          submittedAt: '2026-07-11T00:00:00.000Z',
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    renderForm();

    await user.type(screen.getByLabelText('Name'), 'Example Coffee');
    await user.type(screen.getByLabelText('Country code'), 'JP');
    await user.type(screen.getByLabelText('Street address'), '1-2-3 Example Street');
    await user.type(
      screen.getByLabelText('How to pay'),
      'Ask staff to display a Lightning invoice and scan the QR code.',
    );
    await user.click(screen.getByLabelText(/I have read the Privacy notice/));
    await user.click(screen.getByLabelText(/I agree to the submission terms/));

    const submit = screen.getByRole('button', { name: 'Submit suggestion' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await screen.findByRole('heading', { name: 'Suggestion received' });
    expect(screen.getByText('CPM-S-2026-000123')).toBeInTheDocument();
    expect(screen.getByText('cpmss_private-secret')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/suggest', expect.any(Object));
  });

  it('fails closed when browser Turnstile configuration is unavailable', async () => {
    render(
      <SuggestForm
        siteKey=""
        action=""
        assets={[]}
        networks={[]}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Verification is unavailable');
    expect(screen.getByRole('button', { name: 'Submit suggestion' })).toBeDisabled();
  });
});
