import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoSubmissionDetailResponse } from '../src/admin/submissions/photo-parent';
import type { ReportSubmissionReviewDetailResponse } from '../src/admin/submissions/report-detail';
import { SubmissionReviewFollowupPanel } from '../src/components/admin/SubmissionReviewFollowupPanel';

const submissionId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const uploadId = '30000000-0000-4000-8000-000000000001';
const requestId = '40000000-0000-4000-8000-000000000001';
const initialUpdatedAt = '2026-07-16T03:00:00.000Z';

function reportDetail(
  workflowStatus: 'in_review' | 'needs_information' | 'on_hold',
): ReportSubmissionReviewDetailResponse {
  return {
    generatedAt: initialUpdatedAt,
    submission: {
      id: submissionId,
      publicId: 'CPM-S-2026-000001',
      submissionType: 'problem_report',
      targetType: 'entity',
      targetId,
      workflowStatus,
      resolution: null,
      priority: 100,
      submittedAt: '2026-07-16T02:00:00.000Z',
      updatedAt: initialUpdatedAt,
    },
    projection: {
      reportKind: 'problem_report',
      targetType: 'entity',
      targetId,
      reportType: 'privacy_issue',
      observedAt: '2026-07-16',
      explanation: 'The public record appears to expose personal information.',
      proposedCorrection: null,
      duplicateTarget: null,
      evidenceLinks: [],
      restrictedEvidence: { privateEvidenceUrlPresent: true },
    },
    events: [],
    eventsTruncated: false,
    targetContext: {
      generatedAt: initialUpdatedAt,
      target: {
        targetType: 'entity',
        targetId,
        canonicalPath: '/service/example-service',
        entity: {
          id: targetId,
          entityType: 'online_service',
          name: 'Example Service',
          slug: 'example-service',
          websiteUrl: 'https://service.example/',
          countryCode: 'US',
          entityStatus: 'active',
          visibility: 'public',
          updatedAt: '2026-07-16T01:00:00.000Z',
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

function photoDetail(
  workflowStatus: 'needs_information' | 'on_hold',
): PhotoSubmissionDetailResponse {
  return {
    generatedAt: initialUpdatedAt,
    submission: {
      id: submissionId,
      publicId: 'CPM-S-2026-000001',
      submissionType: 'photos',
      targetType: 'location',
      targetId,
      workflowStatus,
      resolution: null,
      priority: 50,
      submittedAt: '2026-07-16T02:00:00.000Z',
      updatedAt: initialUpdatedAt,
    },
    projection: {
      targetType: 'location',
      targetId,
      relationship: 'customer',
      media: [
        {
          quarantineUploadId: uploadId,
          purpose: 'public_gallery_candidate',
          role: 'exterior',
          declaredMimeType: 'image/jpeg',
          declaredByteSize: 1_024,
          capturedAt: null,
          description: 'Storefront and payment sign.',
          suggestedAltText: 'Storefront with a crypto payment sign.',
          photographerPresent: true,
          rightsStatus: 'submitted_with_permission',
          rightsHolderPresent: true,
          permissionReferencePresent: false,
          licenseName: null,
          licenseUrl: null,
          publicDisplayPermission: true,
        },
      ],
      submitterNote: 'Recent exterior photo.',
    },
    events: [],
    eventsTruncated: false,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('P5-06C2 common review follow-up controls', () => {
  it('requests report information with exact state and exposes explicit resume afterward', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(reportDetail('in_review')), {
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
            action: 'request_information',
            fromStatus: 'in_review',
            toStatus: 'needs_information',
            requestedAction: 'Provide the official privacy contact.',
            publicMessage: 'Please provide the official privacy contact.',
            holdDays: null,
            nextReviewAt: null,
            requiredAction: null,
            changedAt: '2026-07-16T03:01:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => requestId });

    render(<SubmissionReviewFollowupPanel sourceKind="report" submissionId={submissionId} />);

    await user.type(
      await screen.findByLabelText('Requested action'),
      'Provide the official privacy contact.',
    );
    await user.type(
      screen.getAllByLabelText('Public status message')[0]!,
      'Please provide the official privacy contact.',
    );
    await user.click(screen.getByRole('button', { name: 'Request information' }));

    await screen.findByRole('button', { name: 'Resume review' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const mutationCall = fetchMock.mock.calls[1];
    expect(mutationCall?.[0]).toBe(`/admin/api/review-followup/${submissionId}`);
    expect(JSON.parse(String(mutationCall?.[1]?.body))).toEqual({
      schemaVersion: 'submission-review-followup-v1',
      requestId,
      submissionType: 'problem_report',
      action: 'request_information',
      expectedStatus: 'in_review',
      expectedUpdatedAt: initialUpdatedAt,
      requestedAction: 'Provide the official privacy contact.',
      publicMessage: 'Please provide the official privacy contact.',
    });
  });

  it('resumes a held Photos parent without rendering private upload identity', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(photoDetail('on_hold')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            state: 'committed',
            submissionId,
            submissionType: 'photos',
            action: 'resume_from_hold',
            fromStatus: 'on_hold',
            toStatus: 'in_review',
            requestedAction: null,
            publicMessage: null,
            holdDays: null,
            nextReviewAt: null,
            requiredAction: null,
            changedAt: '2026-07-16T03:01:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => requestId });

    render(<SubmissionReviewFollowupPanel sourceKind="photos" submissionId={submissionId} />);

    await user.click(await screen.findByRole('button', { name: 'Resume review' }));

    await screen.findByText(/Held review resumed committed/);
    expect(screen.queryByText(uploadId)).not.toBeInTheDocument();
    const mutationCall = fetchMock.mock.calls[1];
    expect(JSON.parse(String(mutationCall?.[1]?.body))).toEqual({
      schemaVersion: 'submission-review-followup-v1',
      requestId,
      submissionType: 'photos',
      action: 'resume_from_hold',
      expectedStatus: 'on_hold',
      expectedUpdatedAt: initialUpdatedAt,
    });
  });
});
