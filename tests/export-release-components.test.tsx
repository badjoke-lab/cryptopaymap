import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ExportReleaseDetailResponse,
  ExportReleaseQueueResponse,
} from '../src/admin/export-release/workspace';
import { ExportReleaseDetail } from '../src/components/admin/ExportReleaseDetail';
import { ExportReleaseQueue } from '../src/components/admin/ExportReleaseQueue';

const digest = 'a'.repeat(64);
const requestId = '10000000-0000-4000-8000-000000000001';
const generatedAt = '2026-07-04T00:00:00.000Z';
const decidedAt = '2026-07-04T01:00:00.000Z';

function queue(): ExportReleaseQueueResponse {
  return {
    generatedAt: decidedAt,
    query: { limit: 50 },
    currentCandidate: {
      status: 'eligible',
      snapshotDigest: digest,
      artifactCount: 12,
      metadata: {
        datasetVersion: '2026.07.04.1',
        schemaVersion: '1.0.0',
        generatedAt,
      },
      validationIssues: [],
      validationIssueCount: 0,
    },
    recentDecisions: [],
    hasMore: false,
  };
}

function detail(): ExportReleaseDetailResponse {
  const candidate = queue().currentCandidate;
  if (candidate === null) throw new Error('Missing export candidate fixture.');
  return {
    generatedAt: decidedAt,
    candidate: {
      status: candidate.status,
      snapshotDigest: candidate.snapshotDigest,
      artifactCount: candidate.artifactCount,
      metadata: candidate.metadata,
      validationIssues: candidate.validationIssues,
    },
    artifacts: [
      {
        path: '/version.json',
        mediaType: 'application/json',
        sha256: 'b'.repeat(64),
        canonicalByteSize: 512,
        recordCount: 1,
      },
    ],
    decisions: [],
  };
}

beforeEach(() => {
  window.history.replaceState({}, '', '/admin/exports/');
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => requestId),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('export release components', () => {
  it('renders the current private candidate and durable history state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(queue()), { status: 200 })),
    );

    render(<ExportReleaseQueue />);

    expect(
      await screen.findByRole('heading', { name: 'Current release candidate' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2026.07.04.1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review candidate' })).toHaveAttribute(
      'href',
      `/admin/exports/detail/?digest=${digest}`,
    );
    expect(screen.getByText('No durable release decisions match this filter.')).toBeInTheDocument();
  });

  it('submits exact snapshot expectations for approval', async () => {
    window.history.replaceState({}, '', `/admin/exports/detail/?digest=${digest}`);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(detail()), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            requestId,
            action: 'approve',
            releaseStatus: 'approved',
            snapshotDigest: digest,
            artifactCount: 12,
            datasetVersion: '2026.07.04.1',
            schemaVersion: '1.0.0',
            generatedAt,
            decidedAt,
            state: 'committed',
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<ExportReleaseDetail />);

    expect(await screen.findByRole('heading', { name: 'Release decision' })).toBeInTheDocument();
    expect(screen.getByText('/version.json')).toBeInTheDocument();
    await user.type(
      screen.getByLabelText('Public summary'),
      'Validated public export snapshot approved.',
    );
    const submitButton = screen.getByRole('button', { name: 'Commit release decision' });
    const form = submitButton.closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((request.headers as Record<string, string>)['Idempotency-Key']).toBe(requestId);
    expect(JSON.parse(String(request.body))).toEqual({
      action: 'approve',
      expectedSnapshotDigest: digest,
      expectedArtifactCount: 12,
      expectedDatasetVersion: '2026.07.04.1',
      expectedSchemaVersion: '1.0.0',
      expectedGeneratedAt: generatedAt,
      reasonCode: 'release_approved',
      publicSummary: 'Validated public export snapshot approved.',
      internalNote: null,
    });
  });
});
