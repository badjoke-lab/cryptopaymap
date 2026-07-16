import { describe, expect, it, vi } from 'vitest';
import { createTerminalResolutionHandler } from '../functions/admin/api/terminal-resolution/[submissionId]';
import { SubmissionTerminalResolutionError } from '../src/admin/submissions/terminal-resolution';

const submissionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-16T04:00:00.000Z');
const identity = {
  actorId: 'cloudflare-access:terminal-reviewer',
  actorType: 'human' as const,
  subject: 'terminal-reviewer',
  email: 'reviewer@example.com',
};

function body() {
  return {
    schemaVersion: 'submission-terminal-resolution-v1',
    requestId,
    submissionType: 'suggest',
    action: 'not_approved',
    expectedStatus: 'in_review',
    expectedUpdatedAt: '2026-07-16T03:59:00.000Z',
    reasonCode: 'insufficient_evidence',
    publicMessage: 'The Submission could not be approved from the available information.',
    internalNote: null,
    duplicateSubmissionId: null,
  };
}

function context(
  overrides: {
    identity?: unknown;
    subjects?: string;
    contentType?: string;
    submissionId?: string | string[];
    requestBody?: unknown;
  } = {},
) {
  return {
    request: new Request(`https://example.test/admin/api/terminal-resolution/${submissionId}`, {
      method: 'POST',
      headers: { 'Content-Type': overrides.contentType ?? 'application/json' },
      body: JSON.stringify(overrides.requestBody ?? body()),
    }),
    env: {
      CPM_ADMIN_SUBMISSION_TERMINAL_RESOLUTION_SUBJECTS:
        overrides.subjects ?? JSON.stringify(['terminal-reviewer']),
    },
    params: { submissionId: overrides.submissionId ?? submissionId },
    data: { adminIdentity: overrides.identity === undefined ? identity : overrides.identity },
    waitUntil: vi.fn(),
  };
}

describe('P5-06D1 protected terminal-resolution API', () => {
  it('runs terminal resolution for an explicitly authorized subject', async () => {
    const runTerminalResolution = vi.fn(async () => ({
      state: 'committed' as const,
      submissionId,
      submissionType: 'suggest' as const,
      action: 'not_approved' as const,
      fromStatus: 'in_review' as const,
      toStatus: 'resolved' as const,
      resolution: 'not_approved' as const,
      reasonCode: 'insufficient_evidence' as const,
      publicMessage: body().publicMessage,
      duplicateSubmissionId: null,
      duplicateSubmissionPublicId: null,
      changedAt: now.toISOString(),
    }));

    const response = await createTerminalResolutionHandler({
      runTerminalResolution,
      now: () => now,
    })(context());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      resolution: 'not_approved',
      toStatus: 'resolved',
    });
    expect(runTerminalResolution).toHaveBeenCalledWith(
      {
        actorId: identity.actorId,
        actorType: identity.actorType,
        capabilities: ['submission:terminal-resolution'],
      },
      submissionId,
      body(),
      expect.any(Object),
      now,
    );
  });

  it('fails closed for missing identity or authorization configuration', async () => {
    const runTerminalResolution = vi.fn();
    const denied = await createTerminalResolutionHandler({ runTerminalResolution })(
      context({ identity: null }),
    );
    expect(denied.status).toBe(403);

    const unavailable = await createTerminalResolutionHandler({ runTerminalResolution })(
      context({ subjects: '' }),
    );
    expect(unavailable.status).toBe(503);
    expect(runTerminalResolution).not.toHaveBeenCalled();
  });

  it('maps bounded request, eligibility, conflict, and backend failures', async () => {
    const mediaType = await createTerminalResolutionHandler({ runTerminalResolution: vi.fn() })(
      context({ contentType: 'text/plain' }),
    );
    expect(mediaType.status).toBe(415);

    for (const [code, status] of [
      ['ineligible', 422],
      ['conflict', 409],
      ['idempotency_conflict', 409],
    ] as const) {
      const response = await createTerminalResolutionHandler({
        runTerminalResolution: vi.fn(async () => {
          throw new SubmissionTerminalResolutionError(code, 'private detail');
        }),
      })(context());
      expect(response.status).toBe(status);
    }

    const unavailable = await createTerminalResolutionHandler({
      runTerminalResolution: vi.fn(async () => {
        throw new Error('private database detail');
      }),
    })(context());
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      error: 'submission_terminal_resolution_unavailable',
    });
  });
});
