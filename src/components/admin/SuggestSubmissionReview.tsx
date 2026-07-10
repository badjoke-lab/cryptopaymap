import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  suggestSubmissionReviewDetailResponseSchema,
  type SuggestSubmissionReviewDetailResponse,
} from '../../admin/submissions/detail';
import { Button } from '../ui/Button';

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; detail: SuggestSubmissionReviewDetailResponse }
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <h2 className="m-0 text-xl font-semibold tracking-tight text-ink">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Value({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm text-ink">{value}</dd>
    </div>
  );
}

function DetailView({ detail }: { detail: SuggestSubmissionReviewDetailResponse }) {
  const { submission, projection, signals, events, eventsTruncated } = detail;
  return (
    <div className="grid gap-6">
      <Section title="Submission summary">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Value label="Reference" value={submission.publicId} />
          <Value label="Status" value={submission.workflowStatus.replaceAll('_', ' ')} />
          <Value label="Priority" value={submission.priority} />
          <Value label="Relationship" value={submission.relationship.replaceAll('_', ' ')} />
          <Value label="Kind" value={projection.suggestionKind.replaceAll('_', ' ')} />
          <Value label="Observed" value={projection.observedAt} />
          <Value label="Submitted" value={new Date(submission.submittedAt).toLocaleString()} />
          <Value label="Updated" value={new Date(submission.updatedAt).toLocaleString()} />
        </dl>
      </Section>

      <Section title="Normalized proposal">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Value label="Name" value={projection.entity.name} />
          <Value label="Legal name" value={projection.entity.legalName ?? 'Not supplied'} />
          <Value
            label="Official website"
            value={
              projection.entity.websiteUrl ? (
                <a href={projection.entity.websiteUrl}>{projection.entity.websiteUrl}</a>
              ) : (
                'Not supplied'
              )
            }
          />
          <Value
            label="Country"
            value={projection.entity.countryCode ?? projection.place?.countryCode ?? 'Not supplied'}
          />
          {projection.place ? (
            <>
              <Value label="Branch" value={projection.place.branchName ?? 'Not supplied'} />
              <Value label="Address" value={projection.place.addressLine ?? 'Not supplied'} />
              <Value label="Locality" value={projection.place.locality ?? 'Not supplied'} />
              <Value
                label="Coordinates"
                value={
                  projection.place.latitude !== null && projection.place.longitude !== null
                    ? `${projection.place.latitude}, ${projection.place.longitude}`
                    : 'Not supplied'
                }
              />
            </>
          ) : null}
        </dl>
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-ink">Category proposals</h3>
          {projection.categories.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No category classification proposed.</p>
          ) : (
            <ul className="mt-2 grid gap-2 text-sm text-ink">
              {projection.categories.map((category) => (
                <li key={category.slug}>
                  {category.slug}
                  {category.isPrimary ? ' · primary' : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section title="Payment proposals">
        <div className="grid gap-4">
          {projection.paymentProposals.map((payment, index) => (
            <article
              key={`${payment.assetSlug ?? 'unknown'}-${payment.networkSlug ?? 'unknown'}-${index}`}
              className="rounded-control border border-border bg-canvas p-4"
            >
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Value label="Asset" value={payment.assetSlug ?? 'Unknown'} />
                <Value label="Network" value={payment.networkSlug ?? 'Unknown'} />
                <Value label="Route" value={payment.routeType ?? 'Unknown'} />
                <Value label="Method" value={payment.paymentMethod ?? 'Unknown'} />
                <Value label="Processor" value={payment.processor?.name ?? 'None / unknown'} />
                <Value label="Primary" value={payment.isPrimary ? 'Yes' : 'No / unknown'} />
                <Value label="How to pay" value={payment.howToPay ?? 'Not supplied'} />
                <Value label="Restrictions" value={payment.restrictions ?? 'Not supplied'} />
              </dl>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Submitted evidence links">
        {projection.evidenceLinks.length === 0 ? (
          <p className="m-0 text-sm text-muted">No evidence links were supplied.</p>
        ) : (
          <ul className="grid gap-3">
            {projection.evidenceLinks.map((evidence) => (
              <li
                key={evidence.url}
                className="rounded-control border border-border bg-canvas p-4 text-sm"
              >
                <a
                  className="break-all font-medium"
                  href={evidence.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {evidence.url}
                </a>
                <p className="mt-2 text-muted">Observed: {evidence.observedAt ?? 'Unknown'}</p>
                {evidence.summary ? <p className="mt-2 text-ink">{evidence.summary}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Review signals">
        <p className="m-0 text-sm leading-6 text-muted">
          Signals are bounded review hints only. Zero results are explicitly non-conclusive and no
          automatic duplicate or target decision is made.
        </p>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-ink">Possible Candidate overlap</h3>
            {signals.candidateSignals.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No bounded Candidate signal found.</p>
            ) : (
              <ul className="mt-3 grid gap-3">
                {signals.candidateSignals.map((signal) => (
                  <li
                    key={signal.candidateId}
                    className="rounded-control border border-border bg-canvas p-4 text-sm"
                  >
                    <a
                      href={`/admin/candidates/detail?id=${encodeURIComponent(signal.candidateId)}`}
                      className="font-semibold"
                    >
                      Candidate {signal.candidateId.slice(0, 8)}…
                    </a>
                    <p className="mt-2 text-muted">
                      {signal.reasons
                        .map((reason) => `${reason.reason} (${reason.strength})`)
                        .join(', ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">Possible canonical target</h3>
            {signals.canonicalTargetSignals.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No bounded canonical target signal found.</p>
            ) : (
              <ul className="mt-3 grid gap-3">
                {signals.canonicalTargetSignals.map((signal) => (
                  <li
                    key={signal.target.canonicalPath}
                    className="rounded-control border border-border bg-canvas p-4 text-sm"
                  >
                    <a href={signal.target.canonicalPath} className="font-semibold">
                      {signal.target.entity.name}
                    </a>
                    <p className="mt-2 text-muted">
                      {signal.reasons.join(', ')} · {signal.strength}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      <Section title="Workflow history">
        <ol className="grid gap-3">
          {events.map((event, index) => (
            <li
              key={`${event.createdAt}-${index}`}
              className="rounded-control border border-border bg-canvas p-4 text-sm"
            >
              <p className="font-semibold text-ink">{event.action.replaceAll('_', ' ')}</p>
              <p className="mt-1 text-muted">
                {event.fromStatus ? `${event.fromStatus} → ` : ''}
                {event.toStatus} · {event.actorType} · {new Date(event.createdAt).toLocaleString()}
              </p>
              {event.reasonCode ? (
                <p className="mt-1 text-muted">Reason: {event.reasonCode}</p>
              ) : null}
            </li>
          ))}
        </ol>
        {eventsTruncated ? (
          <p className="mt-3 text-sm text-muted">History is truncated to the first 100 events.</p>
        ) : null}
      </Section>
    </div>
  );
}

export function SuggestSubmissionReview() {
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const submissionId =
    typeof window === 'undefined' ? null : new URL(window.location.href).searchParams.get('id');

  const loadDetail = useCallback(async () => {
    if (!submissionId) {
      setState({ status: 'missing_id' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const response = await fetch(`/admin/api/submissions/${encodeURIComponent(submissionId)}`, {
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
      const result = suggestSubmissionReviewDetailResponseSchema.safeParse(await response.json());
      setState(result.success ? { status: 'ready', detail: result.data } : { status: 'error' });
    } catch {
      setState({ status: 'error' });
    }
  }, [submissionId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  if (state.status === 'loading') {
    return (
      <StatusPanel
        title="Loading Suggest review"
        description="The protected reviewer workspace is loading the normalized proposal and bounded read-only signals."
        icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
      />
    );
  }
  if (state.status === 'missing_id') {
    return (
      <StatusPanel
        title="Submission ID required"
        description="Open a Suggest submission from the protected queue."
        icon={<AlertTriangle className="size-5" />}
        action={<a href="/admin/submissions">Return to queue</a>}
      />
    );
  }
  if (state.status === 'denied') {
    return (
      <StatusPanel
        title="Submission review access denied"
        description="Your verified administration identity does not have the Submission read capability."
        icon={<ShieldAlert className="size-5" />}
      />
    );
  }
  if (state.status === 'not_found') {
    return (
      <StatusPanel
        title="Suggest submission not found"
        description="No reviewable Suggest submission matched this protected identifier."
        icon={<AlertTriangle className="size-5" />}
        action={<a href="/admin/submissions">Return to queue</a>}
      />
    );
  }
  if (state.status === 'unavailable') {
    return (
      <StatusPanel
        title="Suggest review unavailable"
        description="The protected detail or signal backends could not complete safely. No partial review workspace is displayed."
        icon={<AlertTriangle className="size-5" />}
        action={
          <Button variant="secondary" onClick={() => void loadDetail()}>
            Retry review
          </Button>
        }
      />
    );
  }
  if (state.status === 'error') {
    return (
      <StatusPanel
        title="Suggest review response could not be verified"
        description="The response was incomplete or invalid. No unverified reviewer values are displayed."
        icon={<AlertTriangle className="size-5" />}
        action={
          <Button variant="secondary" onClick={() => void loadDetail()}>
            Retry review
          </Button>
        }
      />
    );
  }
  return <DetailView detail={state.detail} />;
}
