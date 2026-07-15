import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportSubmissionReviewDetailResponse } from '../src/admin/submissions/report-detail';
import { ReportReviewEntryControls } from '../src/components/admin/ReportReviewEntryControls';

const submissionId = '10000000-0000-4000-8000-000000000001';
const entityId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';

function detailResponse(
  workflowStatus: 'received' | 'triage',
  updatedAt = '2026-07-15T16:00:00.000Z',
): ReportSubmissionReviewDetailResponse {
  return {
    generatedAt: '2026-07-15T16:00:00.000Z',
    submission: {
      id: submissionId,
      publicId: 'CPM-S-2026-000001',
      submissionType: 'problem_report',
      targetType: 'entity',
      targetId: entityId,
      workflowStatus,
      resolution: null,
      priority: 100,
      submittedAt: '2026-07-15T15:00:00.000Z',
      updatedAt,
    },
    projection: {
      reportKind: 'problem_report',
      targetType: 'entity',
      targetId: entityId,
      reportType: 'privacy_issue',
      observedAt: '2026-07-15',
      explanation: 'The public record appears to expose personal information.',
      proposedCorrection: null,
      duplicateTarget: null,
      evidenceLinks: [],
      restrictedEvidence: { privateEvidenceUrlPresent: true },
    },
    events: [],
    eventsTruncated: false,
    targetContext: {
      generatedAt: '2026-07-15T16:00:00.000Z',
      target: {
        targetType: 'entity',
        targetId: entityId,
        canonicalPath: '/service/example-service',
        entity: {
          id: entityId,
          entityType: 'online_service',
          name: 'Example Service',
          slug: 'example-service',
          websiteUrl: 'https://service.example/',
          countryCode: 'US',
          entityStatus: 'active',
          visibility: 'public',
          updatedAt: '2026-07-15T14:00:00.000Z',
        },
        location: null,
        selectedClaimId: null,
      },
      reportability: { publiclyReachable: true, reasons: [] },
      claimSignals: [],
      coverage: {
        targetLookupComplete: true,
        claimContextComplete: true,
        absenceIsConclusive: false,
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('P5-06B2A report review-entry controls', () => {
  it('moves a received report into triage with exact state guards and reloads the workspace', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(detailResponse('received')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            state: 'committed',
            submissionId,
            submissionType: 'problem_report',
            fromStatus: 'received',
            toStatus: 'triage',
            action: 'begin_triage',
            changedAt: '2026-07-15T16:01:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(detailResponse('triage', '2026-07-15T16:01:00.000Z')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => requestId });

    render(<ReportReviewEntryControls submissionId={submissionId} />);

    await user.click(await screen.findByRole('button', { name: 'Begin triage' }));

    await screen.findByRole('button', { name: 'Begin review' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const transitionCall = fetchMock.mock.calls[1];
    expect(transitionCall?.[0]).toBe(`/admin/api/review-entry/${submissionId}`);
    expect(transitionCall?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
    });
    expect(JSON.parse(String(transitionCall?.[1]?.body))).toEqual({
      schemaVersion: 'submission-review-entry-v1',
      requestId,
      submissionType: 'problem_report',
      action: 'begin_triage',
      expectedStatus: 'received',
      expectedUpdatedAt: '2026-07-15T16:00:00.000Z',
    });
  });
});
