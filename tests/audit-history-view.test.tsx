import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditHistoryView } from '../src/components/admin/AuditHistoryView';

const firstItem = {
  id: 'export_activation:20000000-0000-4000-8000-000000000001',
  occurredAt: '2026-07-04T11:00:00.000Z',
  domain: 'export' as const,
  sourceKind: 'export_activation' as const,
  action: 'activate_release',
  actorId: 'cloudflare-access:publisher',
  actorType: 'human' as const,
  requestId: '10000000-0000-4000-8000-000000000001',
  target: { type: 'export_snapshot' as const, id: 'a'.repeat(64) },
  secondaryTargets: [],
  reasonCode: 'activate_approved_release',
  summary: null,
  transition: null,
  sourceRecordId: '20000000-0000-4000-8000-000000000001',
};

const secondItem = {
  ...firstItem,
  id: 'export_release_decision:20000000-0000-4000-8000-000000000002',
  occurredAt: '2026-07-04T10:00:00.000Z',
  sourceKind: 'export_release_decision' as const,
  action: 'approve_release',
  sourceRecordId: '20000000-0000-4000-8000-000000000002',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function history(items: unknown[], hasMore = false) {
  return {
    generatedAt: '2026-07-04T12:00:00.000Z',
    query: { limit: 50 },
    items,
    hasMore,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuditHistoryView', () => {
  it('loads and renders normalized audit events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(history([firstItem]))),
    );

    render(<AuditHistoryView />);

    expect(await screen.findByText('Activate Release')).toBeInTheDocument();
    expect(screen.getByText(/Cloudflare-access:publisher/i)).toBeInTheDocument();
    expect(screen.getByText('1 loaded')).toBeInTheDocument();
  });

  it('applies bounded domain and actor filters', async () => {
    const requestUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrls.push(String(input));
      return jsonResponse(history([]));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<AuditHistoryView />);
    await screen.findByText('No audit events match this filter');

    fireEvent.change(screen.getByLabelText('Domain'), { target: { value: 'export' } });
    fireEvent.change(screen.getByLabelText('Actor ID'), {
      target: { value: 'cloudflare-access:publisher' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const requestUrl = requestUrls[1] ?? '';
    expect(requestUrl).toContain('domain=export');
    expect(requestUrl).toContain('actorId=cloudflare-access%3Apublisher');
    expect(requestUrl).toContain('limit=50');
  });

  it('loads older events with the stable audit cursor', async () => {
    const requestUrls: string[] = [];
    let requestCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrls.push(String(input));
      requestCount += 1;
      return requestCount === 1
        ? jsonResponse(history([firstItem], true))
        : jsonResponse(history([secondItem], false));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<AuditHistoryView />);

    await screen.findByText('Activate Release');
    fireEvent.click(screen.getByRole('button', { name: 'Load older events' }));

    expect(await screen.findByText('Approve Release')).toBeInTheDocument();
    const requestUrl = requestUrls[1] ?? '';
    expect(requestUrl).toContain(`before=${encodeURIComponent(firstItem.occurredAt)}`);
    expect(requestUrl).toContain(`beforeId=${encodeURIComponent(firstItem.id)}`);
  });

  it('shows access denied without rendering history cards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'audit_history_denied' }, 403)),
    );
    render(<AuditHistoryView />);

    expect(await screen.findByText('Audit history access denied')).toBeInTheDocument();
    expect(screen.queryByText('Audit events')).not.toBeInTheDocument();
  });
});
