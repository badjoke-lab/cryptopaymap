import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoSubmissionDetailResponse } from '../src/admin/submissions/photo-parent';
import type { ReportSubmissionReviewDetailResponse } from '../src/admin/submissions/report-detail';
import { SubmissionTerminalResolutionPanel } from '../src/components/admin/SubmissionTerminalResolutionPanel';

const submissionId = '10000000-0000-4000-8000-000000000001';
const targetId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';
const updatedAt = '2026-07-16T05:00:00.000Z';
const changedAt = '2026-07-16T05:01:00.000Z';

function reportDetail(): ReportSubmissionReviewDetailResponse {
  return {
    generatedAt: updatedAt,
    submission: {
      id: submissionId,
      publicId: 'CPM-S-2026-000001',
      submissionType: 'problem_report',
      targetType: 'entity',
      targetId,
      workflowStatus: 'in_review',
      resolution: null,
      priority: 100,
      submittedAt: '2026-07-16T04:00:00.000Z',
      updatedAt,
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
      generatedAt: updatedAt,
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
          updatedAt: '2026-07-16T03:00:00.000Z',
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

function photoDetail(): PhotoSubmissionDetailResponse {
  return {
    generatedAt: updatedAt,
    submission: {
      id: submissionId,
      publicId: 'CPM-S-2026-000001',
      submissionType: 'photos',
      targetType: 'location',
      targetId,
      workflowStatus: 'in_review',
      resolution: null,
      priority: 50,
      submittedAt: '2026-07-16T04:00:00.000Z',
      updatedAt,
    },
    projection: {
      targetType: 'location',
      targetId,
      relationship: 'customer',
      media: [
        {
          quarantineUploadId: '40000000-0000-4000-8000-000000000001',
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

describe('P5-06D2 terminal-resolution controls', () => {
  it('offers report not-approved and withdrawal without stealing typed duplicate or no-change', async () => {
    const user = userEvent.setup();
    const publicMessage = 'The report could not be approved from the available information.';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(reportDetail()), {
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
            action: 'not_approved',
            fromStatus: 'in_review',
            toStatus: 'resolved',
            resolution: 'not_approved',
            reasonCode: 'insufficient_evidence',
            publicMessage,
            duplicateSubmissionId: null,
            duplicateSubmissionPublicId: null,
            changedAt,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => requestId });

    render(<SubmissionTerminalResolutionPanel sourceKind="report" submissionId={submissionId} />);

    const outcome = await screen.findByRole('combobox', { name: 'Terminal outcome' });
    expect(screen.getByRole('option', { name: 'Not approved' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Withdrawn' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Duplicate Submission' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'No change required' })).not.toBeInTheDocument();

    await user.selectOptions(outcome, 'not_approved');
    await user.type(screen.getByRole('textbox', { name: 'Public status message' }), publicMessage);
    await user.click(screen.getByRole('button', { name: 'Commit terminal outcome' }));

    await screen.findByText(/Not approved committed/);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/admin/api/terminal-resolution/${submissionId}`);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      schemaVersion: 'submission-terminal-resolution-v1',
      requestId,
      submissionType: 'problem_report',
      action: 'not_approved',
      expectedStatus: 'in_review',
      expectedUpdatedAt: updatedAt,
      reasonCode: 'insufficient_evidence',
      publicMessage,
      internalNote: null,
      duplicateSubmissionId: null,
    });
  });

  it('offers Photos duplicate, no-change, and withdrawal but reserves not-approved for P5-06E', async () => {
    const user = userEvent.setup();
    const publicMessage = 'The submitted photos require no public change.';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(photoDetail()), {
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
            action: 'no_change',
            fromStatus: 'in_review',
            toStatus: 'resolved',
            resolution: 'no_change',
            reasonCode: 'already_current',
            publicMessage,
            duplicateSubmissionId: null,
            duplicateSubmissionPublicId: null,
            changedAt,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => requestId });

    render(<SubmissionTerminalResolutionPanel sourceKind="photos" submissionId={submissionId} />);

    const outcome = await screen.findByRole('combobox', { name: 'Terminal outcome' });
    expect(screen.getByRole('option', { name: 'Duplicate Submission' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'No change required' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Withdrawn' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Not approved' })).not.toBeInTheDocument();

    await user.selectOptions(outcome, 'no_change');
    await user.type(screen.getByRole('textbox', { name: 'Public status message' }), publicMessage);
    await user.click(screen.getByRole('button', { name: 'Commit terminal outcome' }));

    await screen.findByText(/No change required committed/);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      submissionType: 'photos',
      action: 'no_change',
      reasonCode: 'already_current',
      duplicateSubmissionId: null,
    });
  });
});
