import { AlertTriangle, CheckCircle2, FileX2, RefreshCw, ShieldAlert } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { suggestSubmissionReviewDetailResponseSchema } from '../../admin/submissions/detail';
import { photoSubmissionDetailResponseSchema } from '../../admin/submissions/photo-parent';
import { reportSubmissionReviewDetailResponseSchema } from '../../admin/submissions/report-detail';
import {
  submissionTerminalResolutionReceiptSchema,
  submissionTerminalResolutionRequestSchema,
  type SubmissionTerminalResolutionRequest,
} from '../../admin/submissions/terminal-resolution';
import { Button } from '../ui/Button';

type SourceKind = 'suggest' | 'report' | 'photos';
type TerminalSubmissionType = 'suggest' | 'payment_report' | 'problem_report' | 'photos';
type TerminalAction = 'not_approved' | 'duplicate' | 'no_change' | 'withdrawn';
type ActiveStatus = 'received' | 'triage' | 'in_review' | 'needs_information' | 'on_hold';
type WorkflowStatus = ActiveStatus | 'resolved' | 'duplicate' | 'rejected_spam' | 'withdrawn';

interface Snapshot {
  submissionId: string;
  publicId: string;
  submissionType: TerminalSubmissionType;
  workflowStatus: WorkflowStatus;
  updatedAt: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: Snapshot }
  | { status: 'missing_id' }
  | { status: 'denied' }
  | { status: 'not_found' }
  | { status: 'unavailable' }
  | { status: 'error' };

type MutationState =
  | { status: 'idle' }
  | { status: 'submitting'; request: SubmissionTerminalResolutionRequest }
  | { status: 'failed'; request: SubmissionTerminalResolutionRequest; message: string }
  | {
      status: 'committed';
      action: TerminalAction;
      resolution: TerminalAction;
      replayed: boolean;
    };

const actionLabels: Record<TerminalAction, string> = {
  not_approved: 'Not approved',
  duplicate: 'Duplicate Submission',
  no_change: 'No change required',
  withdrawn: 'Withdrawn',
};

const reasonOptions: Record<TerminalAction, readonly { value: string; label: string }[]> = {
  not_approved: [
    { value: 'insufficient_evidence', label: 'Insufficient evidence' },
    { value: 'unverifiable', label: 'Could not be verified' },
    { value: 'out_of_scope', label: 'Out of scope' },
    { value: 'policy_not_met', label: 'Policy requirements not met' },
    { value: 'hold_expired', label: 'Hold period expired' },
    { value: 'other', label: 'Other bounded reason' },
  ],
  duplicate: [{ value: 'duplicate_submission', label: 'Duplicate Submission' }],
  no_change: [
    { value: 'already_current', label: 'Canonical information is already current' },
    { value: 'no_material_difference', label: 'No material difference' },
    { value: 'other', label: 'Other bounded reason' },
  ],
  withdrawn: [
    { value: 'submitter_requested', label: 'Submitter requested withdrawal' },
    { value: 'superseded_by_submitter', label: 'Superseded by later submitter material' },
    { value: 'other', label: 'Other bounded reason' },
  ],
};

function StatusPanel({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      className="rounded-card border border-border bg-surface p-5 shadow-sm"
      aria-live="polite"
    >
      <div className="flex items-start gap-4">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-control bg-canvas text-muted"
          aria-hidden="true"
        >
          {icon}
        </span>
        <div>
          <h2 className="m-0 text-lg font-semibold tracking-tight text-ink">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </div>
    </section>
  );
}

async function loadSnapshot(sourceKind: SourceKind, submissionId: string): Promise<Response> {
  const path =
    sourceKind === 'suggest'
      ? `/admin/api/submissions/${encodeURIComponent(submissionId)}`
      : sourceKind === 'report'
        ? `/admin/api/reports/${encodeURIComponent(submissionId)}`
        : `/admin/api/photo-submissions/${encodeURIComponent(submissionId)}`;
  return fetch(path, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
}

function parseSnapshot(sourceKind: SourceKind, value: unknown): Snapshot | null {
  if (sourceKind === 'suggest') {
    const result = suggestSubmissionReviewDetailResponseSchema.safeParse(value);
    if (!result.success) return null;
    return {
      submissionId: result.data.submission.id,
      publicId: result.data.submission.publicId,
      submissionType: 'suggest',
      workflowStatus: result.data.submission.workflowStatus,
      updatedAt: result.data.submission.updatedAt,
    };
  }
  if (sourceKind === 'report') {
    const result = reportSubmissionReviewDetailResponseSchema.safeParse(value);
    if (!result.success) return null;
    return {
      submissionId: result.data.submission.id,
      publicId: result.data.submission.publicId,
      submissionType: result.data.submission.submissionType,
      workflowStatus: result.data.submission.workflowStatus,
      updatedAt: result.data.submission.updatedAt,
    };
  }
  const result = photoSubmissionDetailResponseSchema.safeParse(value);
  if (!result.success) return null;
  return {
    submissionId: result.data.submission.id,
    publicId: result.data.submission.publicId,
    submissionType: 'photos',
    workflowStatus: result.data.submission.workflowStatus,
    updatedAt: result.data.submission.updatedAt,
  };
}

function availableActions(snapshot: Snapshot): TerminalAction[] {
  const actions: TerminalAction[] = [];
  const status = snapshot.workflowStatus;
  const reviewedOrPaused = ['in_review', 'needs_information', 'on_hold'].includes(status);

  if (
    reviewedOrPaused &&
    ['suggest', 'payment_report', 'problem_report'].includes(snapshot.submissionType)
  ) {
    actions.push('not_approved');
  }
  if (
    ['received', 'triage', 'in_review'].includes(status) &&
    ['suggest', 'photos'].includes(snapshot.submissionType)
  ) {
    actions.push('duplicate');
  }
  if (status === 'in_review' && ['suggest', 'photos'].includes(snapshot.submissionType)) {
    actions.push('no_change');
  }
  if (['received', 'triage', 'in_review', 'needs_information', 'on_hold'].includes(status)) {
    actions.push('withdrawn');
  }
  return actions;
}

function buildRequest(
  snapshot: Snapshot,
  action: TerminalAction,
  reasonCode: string,
  publicMessage: string,
  internalNote: string,
  duplicateSubmissionId: string,
): SubmissionTerminalResolutionRequest {
  return submissionTerminalResolutionRequestSchema.parse({
    schemaVersion: 'submission-terminal-resolution-v1',
    requestId: globalThis.crypto.randomUUID(),
    submissionType: snapshot.submissionType,
    action,
    expectedStatus: snapshot.workflowStatus,
    expectedUpdatedAt: snapshot.updatedAt,
    reasonCode,
    publicMessage,
    internalNote: internalNote.trim() ? internalNote : null,
    duplicateSubmissionId: action === 'duplicate' ? duplicateSubmissionId : null,
  });
}

export function SubmissionTerminalResolutionPanel({
  sourceKind,
  submissionId,
}: {
  sourceKind: SourceKind;
  submissionId: string | null;
}) {
  const [loadState, setLoadState] = useState<LoadState>(
    submissionId ? { status: 'loading' } : { status: 'missing_id' },
  );
  const [mutationState, setMutationState] = useState<MutationState>({ status: 'idle' });
  const [selectedAction, setSelectedAction] = useState<TerminalAction | ''>('');
  const [reasonCode, setReasonCode] = useState('');
  const [publicMessage, setPublicMessage] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [duplicateSubmissionId, setDuplicateSubmissionId] = useState('');

  const loadCurrent = useCallback(async () => {
    if (!submissionId) {
      setLoadState({ status: 'missing_id' });
      return;
    }
    setLoadState({ status: 'loading' });
    try {
      const response = await loadSnapshot(sourceKind, submissionId);
      if (response.status === 403) {
        setLoadState({ status: 'denied' });
        return;
      }
      if (response.status === 404) {
        setLoadState({ status: 'not_found' });
        return;
      }
      if (response.status === 503) {
        setLoadState({ status: 'unavailable' });
        return;
      }
      if (!response.ok) {
        setLoadState({ status: 'error' });
        return;
      }
      const snapshot = parseSnapshot(sourceKind, await response.json());
      setLoadState(snapshot ? { status: 'ready', snapshot } : { status: 'error' });
    } catch {
      setLoadState({ status: 'error' });
    }
  }, [sourceKind, submissionId]);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  const submitRequest = useCallback(
    async (request: SubmissionTerminalResolutionRequest) => {
      if (!submissionId) return;
      setMutationState({ status: 'submitting', request });
      try {
        const response = await fetch(
          `/admin/api/terminal-resolution/${encodeURIComponent(submissionId)}`,
          {
            method: 'POST',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
          },
        );
        if (response.status === 403) {
          setMutationState({
            status: 'failed',
            request,
            message: 'Your verified administration identity cannot close this Submission.',
          });
          return;
        }
        if (response.status === 409) {
          setMutationState({
            status: 'failed',
            request,
            message:
              'The Submission or duplicate reference changed before this outcome committed. Reload the current state.',
          });
          return;
        }
        if (response.status === 422) {
          setMutationState({
            status: 'failed',
            request,
            message:
              'This outcome is owned by a type-specific decision boundary or is not eligible for the current Submission.',
          });
          return;
        }
        if (!response.ok) {
          setMutationState({
            status: 'failed',
            request,
            message: 'The protected terminal-resolution operation could not complete safely.',
          });
          return;
        }
        const result = submissionTerminalResolutionReceiptSchema.safeParse(await response.json());
        if (!result.success) {
          setMutationState({
            status: 'failed',
            request,
            message: 'The terminal-resolution response could not be verified.',
          });
          return;
        }
        setMutationState({
          status: 'committed',
          action: result.data.action,
          resolution: result.data.resolution,
          replayed: result.data.state === 'replayed',
        });
        setLoadState((current) =>
          current.status === 'ready'
            ? {
                status: 'ready',
                snapshot: {
                  ...current.snapshot,
                  workflowStatus: result.data.toStatus,
                  updatedAt: result.data.changedAt,
                },
              }
            : current,
        );
      } catch {
        setMutationState({
          status: 'failed',
          request,
          message: 'The protected terminal-resolution request could not be completed.',
        });
      }
    },
    [submissionId],
  );

  if (loadState.status === 'loading') {
    return (
      <StatusPanel
        title="Loading terminal-resolution controls"
        description="The current private workflow state is being verified before any terminal action is shown."
        icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
      />
    );
  }
  if (loadState.status === 'missing_id' || loadState.status === 'not_found') {
    return (
      <StatusPanel
        title="Submission unavailable"
        description="Open a valid Submission from the protected review queue."
        icon={<AlertTriangle className="size-5" />}
      />
    );
  }
  if (loadState.status === 'denied') {
    return (
      <StatusPanel
        title="Terminal-resolution access denied"
        description="Your verified administration identity cannot read this protected Submission."
        icon={<ShieldAlert className="size-5" />}
      />
    );
  }
  if (loadState.status === 'unavailable' || loadState.status === 'error') {
    return (
      <StatusPanel
        title="Terminal-resolution controls unavailable"
        description="The current workflow state could not be verified, so no terminal action is displayed."
        icon={<AlertTriangle className="size-5" />}
        action={
          <Button variant="secondary" onClick={() => void loadCurrent()}>
            Reload current state
          </Button>
        }
      />
    );
  }

  const snapshot = loadState.snapshot;
  const actions = availableActions(snapshot);
  const reasons = selectedAction ? reasonOptions[selectedAction] : [];
  const isSubmitting = mutationState.status === 'submitting';
  const canSubmit =
    selectedAction !== '' &&
    reasonCode !== '' &&
    publicMessage.trim().length > 0 &&
    (selectedAction !== 'duplicate' || duplicateSubmissionId.trim().length > 0);

  return (
    <section
      className="rounded-card border border-red-300 bg-red-50 p-5 shadow-sm"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-red-800">
            P5-06D protected terminal resolution
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">
            Current state: {snapshot.workflowStatus.replaceAll('_', ' ')}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Terminal actions close only the private Submission. They do not delete retained Evidence
            or Media, mutate canonical records, export, or publish. Public status receives only the
            bounded public message below.
          </p>
        </div>
        <span className="rounded-pill border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-800">
          {snapshot.publicId}
        </span>
      </div>

      {mutationState.status === 'committed' ? (
        <div className="mt-4 flex items-start gap-3 rounded-control border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p className="m-0">
            {actionLabels[mutationState.action]}{' '}
            {mutationState.replayed ? 'replayed safely' : 'committed'} with resolution{' '}
            {mutationState.resolution.replaceAll('_', ' ')}.
          </p>
        </div>
      ) : null}

      {mutationState.status === 'failed' ? (
        <div className="mt-4 rounded-control border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="m-0">{mutationState.message}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => void submitRequest(mutationState.request)}>
              Retry same request
            </Button>
            <Button variant="ghost" onClick={() => void loadCurrent()}>
              Reload current state
            </Button>
          </div>
        </div>
      ) : null}

      {actions.length > 0 ? (
        <form
          className="mt-5 grid gap-4 rounded-control border border-red-200 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit || !selectedAction) return;
            void submitRequest(
              buildRequest(
                snapshot,
                selectedAction,
                reasonCode,
                publicMessage,
                internalNote,
                duplicateSubmissionId,
              ),
            );
          }}
        >
          <div className="flex items-center gap-2">
            <FileX2 className="size-5 text-red-700" aria-hidden="true" />
            <h3 className="m-0 text-lg font-semibold text-ink">Close Submission</h3>
          </div>
          <label className="grid gap-2 text-sm font-medium text-ink">
            Terminal outcome
            <select
              className="min-h-11 rounded-control border border-border bg-surface px-3 py-2 font-normal"
              value={selectedAction}
              onChange={(event) => {
                const nextAction = event.currentTarget.value as TerminalAction | '';
                setSelectedAction(nextAction);
                setReasonCode(nextAction ? (reasonOptions[nextAction][0]?.value ?? '') : '');
                if (nextAction !== 'duplicate') setDuplicateSubmissionId('');
              }}
              required
            >
              <option value="">Select an outcome</option>
              {actions.map((action) => (
                <option key={action} value={action}>
                  {actionLabels[action]}
                </option>
              ))}
            </select>
          </label>
          {selectedAction ? (
            <label className="grid gap-2 text-sm font-medium text-ink">
              Reason
              <select
                className="min-h-11 rounded-control border border-border bg-surface px-3 py-2 font-normal"
                value={reasonCode}
                onChange={(event) => setReasonCode(event.currentTarget.value)}
                required
              >
                {reasons.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {selectedAction === 'duplicate' ? (
            <label className="grid gap-2 text-sm font-medium text-ink">
              Referenced duplicate Submission UUID
              <input
                className="min-h-11 rounded-control border border-border bg-surface px-3 py-2 font-normal"
                type="text"
                required
                value={duplicateSubmissionId}
                onChange={(event) => setDuplicateSubmissionId(event.currentTarget.value)}
                placeholder="00000000-0000-4000-8000-000000000000"
              />
              <span className="font-normal text-muted">
                The server requires a different existing Submission of the same type and records its
                public reference in the protected receipt.
              </span>
            </label>
          ) : null}
          <label className="grid gap-2 text-sm font-medium text-ink">
            Public status message
            <textarea
              className="min-h-28 rounded-control border border-border bg-surface px-3 py-2 font-normal"
              maxLength={1_000}
              required
              value={publicMessage}
              onChange={(event) => setPublicMessage(event.currentTarget.value)}
              placeholder="Explain the outcome without exposing reviewer notes, contact data, or private evidence."
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink">
            Internal reviewer note (optional)
            <textarea
              className="min-h-24 rounded-control border border-border bg-surface px-3 py-2 font-normal"
              maxLength={2_000}
              value={internalNote}
              onChange={(event) => setInternalNote(event.currentTarget.value)}
              placeholder="Retained privately and never projected to the submitter."
            />
          </label>
          <div>
            <Button type="submit" loading={isSubmitting} disabled={isSubmitting || !canSubmit}>
              Commit terminal outcome
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-5 rounded-control border border-border bg-white p-4 text-sm text-muted">
          No P5-06D common terminal outcome is available from the current state or Submission type.
          Type-specific decisions remain separate.
        </p>
      )}
    </section>
  );
}
