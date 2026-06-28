import { describe, expect, it, vi } from 'vitest';
import {
  CandidateQueueError,
  decodeCandidateQueueCursor,
  encodeCandidateQueueCursor,
  loadCandidateQueue,
  parseCandidateQueueQuery,
  type CandidateQueueBackend,
  type CandidateQueuePageData,
} from '../src/admin/candidates/queue';

const asOf = new Date('2026-06-28T12:00:00.000Z');
const authorizedContext = {
  actorId: 'cloudflare-access:reviewer-subject',
  actorType: 'human' as const,
  capabilities: ['candidate:read' as const],
};

function validPage(): CandidateQueuePageData {
  return {
    items: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Example Candidate',
        candidateType: 'physical_place',
        status: 'new',
        priority: 900,
        firstSeenAt: '2026-06-01T00:00:00.000Z',
        lastSeenAt: '2026-06-27T00:00:00.000Z',
        updatedAt: '2026-06-27T01:00:00.000Z',
        sourceTypes: ['official_site'],
        sourceCount: 1,
        duplicateSignal: false,
        duplicateGroupStatus: null,
        linkedToCanonical: false,
      },
    ],
    hasNextPage: false,
    nextCursor: null,
  };
}

describe('Candidate queue contract', () => {
  it('parses defaults and bounded filters', () => {
    expect(parseCandidateQueueQuery(new URL('https://example.test/admin/api/candidates'))).toEqual({
      statuses: ['new', 'triaged'],
      candidateTypes: [],
      sourceTypes: [],
      priority: 'all',
      duplicate: 'all',
      limit: 25,
      cursor: null,
    });

    expect(
      parseCandidateQueueQuery(
        new URL(
          'https://example.test/admin/api/candidates?status=new,linked&type=physical_place&source=osm&priority=high&duplicate=flagged&limit=10',
        ),
      ),
    ).toMatchObject({
      statuses: ['new', 'linked'],
      candidateTypes: ['physical_place'],
      sourceTypes: ['osm'],
      priority: 'high',
      duplicate: 'flagged',
      limit: 10,
    });
  });

  it('round-trips a validated opaque cursor and rejects malformed input', () => {
    const cursor = {
      priority: 850,
      lastSeenAt: '2026-06-27T00:00:00.000Z',
      id: '00000000-0000-4000-8000-000000000002',
    };
    expect(decodeCandidateQueueCursor(encodeCandidateQueueCursor(cursor))).toEqual(cursor);
    expect(() => decodeCandidateQueueCursor('not-a-valid-cursor')).toThrow(CandidateQueueError);
  });

  it('rejects unauthorized contexts before backend access', async () => {
    const backend: CandidateQueueBackend = { loadPage: vi.fn(async () => validPage()) };
    await expect(
      loadCandidateQueue(
        { ...authorizedContext, capabilities: [] },
        backend,
        parseCandidateQueueQuery(new URL('https://example.test/admin/api/candidates')),
        asOf,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(backend.loadPage).not.toHaveBeenCalled();
  });

  it('returns a validated page with a generation time', async () => {
    const backend: CandidateQueueBackend = { loadPage: vi.fn(async () => validPage()) };
    const query = parseCandidateQueueQuery(new URL('https://example.test/admin/api/candidates'));
    await expect(loadCandidateQueue(authorizedContext, backend, query, asOf)).resolves.toEqual({
      ...validPage(),
      generatedAt: asOf.toISOString(),
    });
    expect(backend.loadPage).toHaveBeenCalledWith(query, asOf);
  });

  it('rejects an invalid backend page', async () => {
    const invalidPage = validPage();
    invalidPage.hasNextPage = true;
    const backend: CandidateQueueBackend = { loadPage: vi.fn(async () => invalidPage) };
    const query = parseCandidateQueueQuery(new URL('https://example.test/admin/api/candidates'));
    await expect(loadCandidateQueue(authorizedContext, backend, query, asOf)).rejects.toMatchObject(
      {
        code: 'invalid_page',
      },
    );
  });
});
