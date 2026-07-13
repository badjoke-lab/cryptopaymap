import { AlertTriangle, ArrowLeft, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  reportSubmissionReviewDetailResponseSchema,
  type ReportSubmissionReviewDetailResponse,
} from '../../admin/submissions/report-detail';
import { Button } from '../ui/Button';

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; detail: ReportSubmissionReviewDetailResponse }
  | { status: 'missing_id' }
  | { status: 'denied' }
  | { status: 'not_found' }
  | { status: 'unavailable' }
  | { status: 'error' };

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
      className="rounded-card border border-border bg-surface p-6 shadow-sm"
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
          <h2 className="m-0 text-xl font-semibold tracking-tight text-ink">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
          {action ? <div className="mt-5">{action}</div> : null}
        </div>
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm text-ink">{value}</dd>
    </div>
  );
}

function ReviewDetail({ detail }: { detail: ReportSubmissionReviewDetailResponse }) {
  const projection = detail.projection;
  const target = detail.targetContext.target;

  return (
    <div className="grid gap-6">
      <section className="rounded-card border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
              {detail.submission.publicId}
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
              {projection.reportKind === 'payment_report'
                ? `Payment ${projection.result}`
                : projection.reportType.replaceAll('_', ' ')}
            </h2>
          </div>
          <span className="rounded-pill border border-border bg-canvas px-3 py-1 text-xs font-semibold text-muted">
            {detail.submission.workflowStatus.replaceAll('_', ' ')}
          </span>
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Submission type" value={detail.submission.submissionType} />
          <Field label="Priority" value={detail.submission.priority} />
          <Field
            label="Submitted"
            value={new Date(detail.submission.submittedAt).toLocaleString()}
          />
          <Field label="Updated" value={new Date(detail.submission.updatedAt).toLocaleString()} />
        </dl>
      </section>

      <section className="rounded-card border border-border bg-surface p-6 shadow-sm">
        <h2 className="m-0 text-xl font-semibold tracking-tight text-ink">Canonical target</h2>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Target type" value={target.targetType} />
          <Field label="Target ID" value={target.targetId} />
          <Field
            label="Public path"
            value={
              target.canonicalPath ? (
                <a className="text-brand-700 underline" href={target.canonicalPath}>
                  {target.canonicalPath}
                </a>
              ) : (
                'No public path'
              )
            }
          />
          <Field label="Entity" value={target.entity.name} />
          <Field label="Entity status" value={target.entity.entityStatus} />
          <Field
            label="Location"
            value={
              target.location ? (target.location.name ?? target.location.slug) : 'Not applicable'
            }
          />
        </dl>
        <div className="mt-5 rounded-control border border-border bg-canvas p-4 text-sm">
          <p className="m-0 font-semibold text-ink">
            Publicly reachable:{' '}
            {detail.targetContext.reportability.publiclyReachable ? 'yes' : 'no'}
          </p>
          <p className="mt-2 text-muted">
            {detail.targetContext.reportability.reasons.length > 0
              ? detail.targetContext.reportability.reasons.join(', ')
              : 'No bounded reportability issue was returned.'}
          </p>
        </div>
      </section>

      <section className="rounded-card border border-border bg-surface p-6 shadow-sm">
        <h2 className="m-0 text-xl font-semibold tracking-tight text-ink">Normalized report</h2>
        {projection.reportKind === 'payment_report' ? (
          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Result" value={projection.result} />
            <Field label="Payment date" value={projection.paymentDate} />
            <Field label="Asset" value={projection.payment.assetSlug ?? 'Unknown'} />
            <Field label="Network" value={projection.payment.networkSlug ?? 'Unknown'} />
            <Field label="Route" value={projection.payment.routeType ?? 'Unknown'} />
            <Field label="Payment method" value={projection.payment.paymentMethod ?? 'Unknown'} />
            <Field label="Context" value={projection.payment.context ?? 'Unknown'} />
            <Field label="Processor" value={projection.payment.processor?.name ?? 'Not supplied'} />
            <Field
              label="Restricted transaction URL"
              value={
                projection.restrictedEvidence.privateTransactionUrlPresent ? 'Present' : 'Absent'
              }
            />
            <div className="sm:col-span-2 lg:col-span-3">
              <Field
                label="Observed steps"
                value={projection.payment.observedSteps ?? 'Not supplied'}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Notes" value={projection.notes ?? 'Not supplied'} />
            </div>
          </dl>
        ) : (
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Problem type" value={projection.reportType.replaceAll('_', ' ')} />
            <Field label="Observed at" value={projection.observedAt} />
            <div className="sm:col-span-2">
              <Field label="Explanation" value={projection.explanation} />
            </div>
            <div className="sm:col-span-2">
              <Field
                label="Proposed correction"
                value={
                  projection.proposedCorrection ? (
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-control bg-canvas p-3 text-xs">
                      {JSON.stringify(projection.proposedCorrection, null, 2)}
                    </pre>
                  ) : (
                    'Not supplied'
                  )
                }
              />
            </div>
            <Field
              label="Duplicate target"
              value={
                projection.duplicateTarget
                  ? `${projection.duplicateTarget.targetType} · ${projection.duplicateTarget.targetId}`
                  : 'Not supplied'
              }
            />
            <Field
              label="Restricted evidence URL"
              value={projection.restrictedEvidence.privateEvidenceUrlPresent ? 'Present' : 'Absent'}
            />
          </dl>
        )}
      </section>

      <section className="rounded-card border border-border bg-surface p-6 shadow-sm">
        <h2 className="m-0 text-xl font-semibold tracking-tight text-ink">
          Submitted evidence links
        </h2>
        {projection.evidenceLinks.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No public evidence links were submitted.</p>
        ) : (
          <ul className="mt-4 grid gap-3 pl-5 text-sm">
            {projection.evidenceLinks.map((link) => (
              <li key={`${link.url}:${link.observedAt ?? ''}`}>
                <a className="break-all text-brand-700 underline" href={link.url}>
                  {link.url}
                </a>
                {link.observedAt ? ` · observed ${link.observedAt}` : ''}
                {link.summary ? <p className="mt-1 text-muted">{link.summary}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-card border border-border bg-surface p-6 shadow-sm">
        <h2 className="m-0 text-xl font-semibold tracking-tight text-ink">Claim-context signals</h2>
        {detail.targetContext.claimSignals.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No exact bounded Claim-context signal was returned. Absence is not conclusive.
          </p>
        ) : (
          <div className="mt-4 grid gap-3">
            {detail.targetContext.claimSignals.map((signal) => (
              <article
                key={signal.claimId}
                className="rounded-control border border-border bg-canvas p-4"
              >
                <p className="m-0 break-all text-sm font-semibold text-ink">{signal.claimId}</p>
                <p className="mt-2 text-sm text-muted">
                  {signal.claimStatus} · {signal.visibility}
                </p>
                <p className="mt-2 text-sm text-muted">{signal.reasons.join(', ')}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-card border border-border bg-surface p-6 shadow-sm">
        <h2 className="m-0 text-xl font-semibold tracking-tight text-ink">Workflow history</h2>
        {detail.events.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No bounded workflow events were returned.</p>
        ) : (
          <ol className="mt-4 grid gap-3 pl-5 text-sm">
            {detail.events.map((event) => (
              <li
                key={[
                  event.createdAt,
                  event.action,
                  event.fromStatus ?? 'none',
                  event.toStatus,
                  event.actorType,
                  event.reasonCode ?? 'none',
                ].join(':')}
              >
                <span className="font-medium text-ink">{event.action}</span> ·{' '}
                {event.fromStatus ?? 'none'} → {event.toStatus} · {event.actorType} ·{' '}
                {new Date(event.createdAt).toLocaleString()}
                {event.reasonCode ? ` · ${event.reasonCode}` : ''}
              </li>
            ))}
          </ol>
        )}
        {detail.eventsTruncated ? (
          <p className="mt-3 text-sm font-medium text-amber-700">
            Workflow history was truncated at the bounded response limit.
          </p>
        ) : null}
      </section>
    </div>
  );
}

export function ReportSubmissionReview({ submissionId }: { submissionId: string | null }) {
  const [state, setState] = useState<DetailState>(
    submissionId ? { status: 'loading' } : { status: 'missing_id' },
  );

  const loadDetail = useCallback(async () => {
    if (!submissionId) {
      setState({ status: 'missing_id' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const response = await fetch(`/admin/api/reports/${encodeURIComponent(submissionId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (response.status === 403) {
        setState({ status: 'denied' });
        return;
      }
      if (response.status === 404) {
        setState({ status: 'not_found' });
        return;
      }
      if (response.status === 503) {
        setState({ status: 'unavailable' });
        return;
      }
      if (!response.ok) {
        setState({ status: 'error' });
        return;
      }
      const result = reportSubmissionReviewDetailResponseSchema.safeParse(await response.json());
      setState(result.success ? { status: 'ready', detail: result.data } : { status: 'error' });
    } catch {
      setState({ status: 'error' });
    }
  }, [submissionId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  return (
    <div>
      <a
        className="motion-feedback mb-5 inline-flex min-h-11 items-center gap-2 rounded-control px-3 py-2 text-sm font-semibold text-brand-700 no-underline hover:bg-brand-50"
        href="/admin/submissions"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to Submission queues
      </a>
      {state.status === 'loading' ? (
        <StatusPanel
          title="Loading report detail"
          description="The protected detail path is validating normalized report data and read-only canonical target context."
          icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
        />
      ) : null}
      {state.status === 'missing_id' ? (
        <StatusPanel
          title="Missing Submission identifier"
          description="Open a report from the protected queue so the detail path receives a valid UUID."
          icon={<AlertTriangle className="size-5" />}
        />
      ) : null}
      {state.status === 'denied' ? (
        <StatusPanel
          title="Report review access denied"
          description="Your verified administration identity does not have the Submission read capability."
          icon={<ShieldAlert className="size-5" />}
        />
      ) : null}
      {state.status === 'not_found' ? (
        <StatusPanel
          title="Report Submission not found"
          description="The requested identifier does not resolve to a payment or problem report."
          icon={<AlertTriangle className="size-5" />}
        />
      ) : null}
      {state.status === 'unavailable' ? (
        <StatusPanel
          title="Report detail unavailable"
          description="The private detail or canonical context could not complete safely. No partial result is displayed."
          icon={<AlertTriangle className="size-5" />}
          action={
            <Button variant="secondary" onClick={() => void loadDetail()}>
              Retry detail
            </Button>
          }
        />
      ) : null}
      {state.status === 'error' ? (
        <StatusPanel
          title="Report detail response could not be verified"
          description="The response was incomplete or invalid. No unverified private values are displayed."
          icon={<AlertTriangle className="size-5" />}
          action={
            <Button variant="secondary" onClick={() => void loadDetail()}>
              Retry detail
            </Button>
          }
        />
      ) : null}
      {state.status === 'ready' ? <ReviewDetail detail={state.detail} /> : null}
    </div>
  );
}
