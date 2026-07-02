import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  evidenceReviewDetailResponseSchema,
  type EvidenceReviewDetailResponse,
} from '../../admin/evidence-review/workspace';
import type {
  EvidenceReviewClaimAction,
  EvidenceReviewDisposition,
  EvidenceReviewFinding,
} from '../../admin/evidence-review/decision';
import { Button } from '../ui/Button';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; detail: EvidenceReviewDetailResponse }
  | { status: 'missing_id' | 'denied' | 'not_found' | 'unavailable' | 'error' };

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; message: string }
  | { status: 'invalid' | 'conflict' | 'denied' | 'unavailable'; message: string };

function label(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

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
    <section className="rounded-card border border-border bg-surface p-6 shadow-sm" aria-live="polite">
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

function defaultReviewDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().slice(0, 16);
}

function toIso(value: string): string | null {
  if (value.trim().length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function EvidenceReviewDetail() {
  const [evidenceId, setEvidenceId] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    setEvidenceId(new URLSearchParams(window.location.search).get('id'));
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (evidenceId === undefined) return;
    if (!evidenceId) {
      setState({ status: 'missing_id' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const response = await fetch(`/admin/api/evidence/${encodeURIComponent(evidenceId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal: signal ?? null,
      });
      if (response.status === 403) return setState({ status: 'denied' });
      if (response.status === 404) return setState({ status: 'not_found' });
      if (response.status === 400) return setState({ status: 'missing_id' });
      if (response.status === 503) return setState({ status: 'unavailable' });
      if (!response.ok) return setState({ status: 'error' });
      const parsed = evidenceReviewDetailResponseSchema.safeParse(await response.json());
      setState(parsed.success ? { status: 'ready', detail: parsed.data } : { status: 'error' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setState({ status: 'error' });
    }
  }, [evidenceId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <StatusPanel
        title="Loading Evidence review"
        description="The protected service is loading the exact Evidence, Claim version, accepted Evidence set, and threshold result."
        icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
      />
    );
  }
  if (state.status !== 'ready') {
    const copy = {
      missing_id: ['Evidence identifier required', 'Return to the Evidence queue and choose a record.'],
      denied: ['Evidence review access denied', 'This verified identity cannot read Evidence review data.'],
      not_found: ['Evidence not found', 'The requested Evidence record is unavailable or deleted.'],
      unavailable: ['Evidence review unavailable', 'The protected service could not complete safely.'],
      error: ['Evidence response could not be verified', 'No unverified review data is displayed.'],
    } as const;
    const [title, description] = copy[state.status];
    return (
      <StatusPanel
        title={title}
        description={description}
        icon={
          state.status === 'denied' ? (
            <ShieldAlert className="size-5" />
          ) : (
            <AlertTriangle className="size-5" />
          )
        }
        action={
          state.status === 'unavailable' || state.status === 'error' ? (
            <Button variant="secondary" onClick={() => void load()}>
              Retry review
            </Button>
          ) : (
            <a className="text-sm font-semibold text-brand-700" href="/admin/evidence/">
              Return to Evidence queue
            </a>
          )
        }
      />
    );
  }

  return <EvidenceReviewWorkspace detail={state.detail} reload={() => void load()} />;
}

function EvidenceReviewWorkspace({
  detail,
  reload,
}: {
  detail: EvidenceReviewDetailResponse;
  reload: () => void;
}) {
  const evidence = detail.evidence;
  const claim = detail.claim;
  const [disposition, setDisposition] = useState<EvidenceReviewDisposition>('accepted');
  const [finding, setFinding] = useState<EvidenceReviewFinding>(
    evidence.polarity === 'contradicting' ? 'contradicts_claim' : 'supports_claim',
  );
  const [claimAction, setClaimAction] = useState<EvidenceReviewClaimAction>(
    evidence.polarity === 'supporting' && claim.claimStatus !== 'confirmed' ? 'confirm' : 'no_change',
  );
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const pending = evidence.reviewStatus === 'pending';
  const acceptedIds = useMemo(
    () => detail.acceptedEvidence.map((item) => item.id).sort(),
    [detail.acceptedEvidence],
  );

  function normalizeDisposition(next: EvidenceReviewDisposition) {
    setDisposition(next);
    if (next !== 'accepted') {
      setFinding('insufficient');
      setClaimAction('no_change');
    }
  }

  function normalizeFinding(next: EvidenceReviewFinding) {
    setFinding(next);
    if (next === 'insufficient') setClaimAction('no_change');
    if (next === 'supports_claim' && !['no_change', 'confirm'].includes(claimAction)) {
      setClaimAction('no_change');
    }
    if (
      next === 'contradicts_claim' &&
      !['no_change', 'mark_stale', 'end', 'reject'].includes(claimAction)
    ) {
      setClaimAction('no_change');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState({ status: 'submitting' });
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' ? value.trim() : '';
    };
    const body = {
      claimId: claim.id,
      expectedEvidenceUpdatedAt: evidence.updatedAt,
      expectedEvidenceReviewStatus: 'pending',
      expectedClaimUpdatedAt: claim.updatedAt,
      expectedClaimStatus: claim.claimStatus,
      expectedClaimVisibility: claim.visibility,
      expectedAcceptedEvidenceIds: acceptedIds,
      disposition,
      finding,
      claimAction,
      reasonCode: text('reasonCode'),
      publicSummary: text('publicSummary') || null,
      internalNote: text('internalNote') || null,
      nextReviewAt:
        claimAction === 'confirm' || claimAction === 'mark_stale'
          ? toIso(text('nextReviewAt'))
          : null,
      endedReason: claimAction === 'end' ? text('endedReason') || null : null,
    };

    try {
      const response = await fetch(`/admin/api/evidence/${encodeURIComponent(evidence.id)}`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      });
      if (response.status === 403) {
        setSubmitState({ status: 'denied', message: 'This identity cannot review Evidence.' });
        return;
      }
      if (response.status === 409) {
        setSubmitState({
          status: 'conflict',
          message: 'The Evidence, Claim, or accepted Evidence set changed. Reload before retrying.',
        });
        return;
      }
      if (response.status === 400) {
        const result = (await response.json()) as { issues?: string[] };
        setSubmitState({
          status: 'invalid',
          message: result.issues?.[0] ?? 'The Evidence review decision was rejected.',
        });
        return;
      }
      if (!response.ok) {
        setSubmitState({
          status: 'unavailable',
          message: 'The Evidence review decision service is unavailable.',
        });
        return;
      }
      const receipt = (await response.json()) as {
        evidenceReviewStatus: string;
        claimStatus: string;
        verificationEventType: string | null;
      };
      setSubmitState({
        status: 'success',
        message: `Evidence is ${label(receipt.evidenceReviewStatus)}. Claim is ${label(receipt.claimStatus)}${receipt.verificationEventType ? ` via ${label(receipt.verificationEventType)}` : ''}.`,
      });
    } catch {
      setSubmitState({
        status: 'unavailable',
        message: 'The Evidence review request could not be completed.',
      });
    }
  }

  if (submitState.status === 'success') {
    return (
      <StatusPanel
        title="Evidence decision committed"
        description={submitState.message}
        icon={<CheckCircle2 className="size-5" />}
        action={
          <div className="flex flex-wrap gap-4">
            <Button variant="secondary" onClick={reload}>
              Reload committed state
            </Button>
            <a className="self-center text-sm font-semibold text-brand-700" href="/admin/evidence/">
              Return to Evidence queue
            </a>
          </div>
        }
      />
    );
  }

  return (
    <div>
      <a className="text-sm font-semibold text-brand-700" href="/admin/evidence/">
        ← Evidence queue
      </a>

      <section className="mt-5 rounded-card border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
              {label(evidence.evidenceClass)} Evidence · {label(evidence.polarity)}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              {evidence.sourceName ?? label(evidence.sourceType)}
            </h2>
          </div>
          <span className="rounded-pill border border-border bg-canvas px-3 py-1 text-xs font-semibold text-muted">
            {label(evidence.reviewStatus)}
          </span>
        </div>
        <p className="mt-4 max-w-4xl text-sm leading-6 text-muted">{evidence.summary}</p>
        <div className="mt-5 flex flex-wrap gap-4 text-sm">
          {evidence.sourceUrl ? (
            <a
              className="inline-flex items-center gap-2 font-semibold text-brand-700"
              href={evidence.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open source <ExternalLink className="size-4" />
            </a>
          ) : null}
          {evidence.archiveUrl ? (
            <a
              className="inline-flex items-center gap-2 font-semibold text-brand-700"
              href={evidence.archiveUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open archive <ExternalLink className="size-4" />
            </a>
          ) : null}
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="font-semibold text-ink">Origin role</dt><dd className="mt-1 text-muted">{label(evidence.originRole)}</dd></div>
          <div><dt className="font-semibold text-ink">Observed</dt><dd className="mt-1 text-muted">{evidence.observedAt ?? 'Not recorded'}</dd></div>
          <div><dt className="font-semibold text-ink">Published</dt><dd className="mt-1 text-muted">{evidence.publishedAt ?? 'Not recorded'}</dd></div>
          <div><dt className="font-semibold text-ink">Evidence version</dt><dd className="mt-1 text-muted">{evidence.updatedAt}</dd></div>
        </dl>
      </section>

      <section className="mt-6 rounded-card border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">Claim under review</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">{label(claim.claimStatus)} · {label(claim.routeType)}</h2>
          </div>
          <span className="rounded-pill border border-border bg-canvas px-3 py-1 text-xs font-semibold text-muted">
            {label(claim.visibility)}
          </span>
        </div>
        <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2">
          <div><dt className="font-semibold text-ink">How to pay</dt><dd className="mt-1 text-muted">{claim.howToPay ?? 'Not recorded'}</dd></div>
          <div><dt className="font-semibold text-ink">Merchant receives</dt><dd className="mt-1 text-muted">{label(claim.merchantReceives)}</dd></div>
          <div><dt className="font-semibold text-ink">Acceptance scope</dt><dd className="mt-1 text-muted">{label(claim.acceptanceScope)}</dd></div>
          <div><dt className="font-semibold text-ink">Claim version</dt><dd className="mt-1 text-muted">{claim.updatedAt}</dd></div>
        </dl>
        <div className="mt-5 rounded-control border border-border bg-canvas p-4 text-sm">
          <p className="font-semibold text-ink">
            Accepted Evidence threshold: {detail.threshold.eligible ? 'Eligible' : 'Not eligible'}
          </p>
          <p className="mt-1 text-muted">
            {detail.threshold.basis ? label(detail.threshold.basis) : 'No confirmation basis'} · {acceptedIds.length} accepted record{acceptedIds.length === 1 ? '' : 's'} before this decision
          </p>
        </div>
      </section>

      <form className="mt-6 grid gap-6" onSubmit={submit}>
        <section className="rounded-card border border-brand-600 bg-brand-50 p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-ink">Evidence decision</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            The Evidence version, Claim version, visibility, status, and complete accepted Evidence set are fixed in this request. Claim visibility cannot be changed here.
          </p>
        </section>
        <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-semibold text-ink">
              Disposition
              <select
                className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                value={disposition}
                onChange={(event) => normalizeDisposition(event.target.value as EvidenceReviewDisposition)}
              >
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
                <option value="held">Held</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-ink">
              Finding
              <select
                className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                value={finding}
                disabled={disposition !== 'accepted'}
                onChange={(event) => normalizeFinding(event.target.value as EvidenceReviewFinding)}
              >
                <option value="supports_claim">Supports Claim</option>
                <option value="contradicts_claim">Contradicts Claim</option>
                <option value="insufficient">Insufficient</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-ink">
              Claim action
              <select
                className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                value={claimAction}
                disabled={disposition !== 'accepted' || finding === 'insufficient'}
                onChange={(event) => setClaimAction(event.target.value as EvidenceReviewClaimAction)}
              >
                <option value="no_change">No change</option>
                {finding === 'supports_claim' ? <option value="confirm">Confirm</option> : null}
                {finding === 'contradicts_claim' ? <option value="mark_stale">Mark stale</option> : null}
                {finding === 'contradicts_claim' ? <option value="end">End</option> : null}
                {finding === 'contradicts_claim' ? <option value="reject">Reject</option> : null}
              </select>
            </label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-ink">
              Reason code
              <input
                className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                name="reasonCode"
                defaultValue={disposition === 'held' ? 'needs_more_information' : 'review_decision'}
                pattern="[a-z0-9]+(?:_[a-z0-9]+)*"
                required
              />
            </label>
            {claimAction === 'confirm' || claimAction === 'mark_stale' ? (
              <label className="grid gap-2 text-sm font-semibold text-ink">
                Next review time
                <input
                  className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                  name="nextReviewAt"
                  type="datetime-local"
                  defaultValue={defaultReviewDate()}
                  required
                />
              </label>
            ) : null}
            {claimAction === 'end' ? (
              <label className="grid gap-2 text-sm font-semibold text-ink md:col-span-2">
                Ended reason
                <input
                  className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                  name="endedReason"
                  required
                />
              </label>
            ) : null}
            <label className="grid gap-2 text-sm font-semibold text-ink md:col-span-2">
              Public summary
              <textarea
                className="min-h-28 rounded-control border border-border bg-white px-3 py-2 font-normal"
                name="publicSummary"
                maxLength={1000}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-ink md:col-span-2">
              Internal note
              <textarea
                className="min-h-28 rounded-control border border-border bg-white px-3 py-2 font-normal"
                name="internalNote"
                maxLength={2000}
              />
            </label>
          </div>
        </section>

        {!pending ? (
          <p className="rounded-control border border-warning/50 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
            This Evidence is no longer pending. Reload the queue instead of submitting another decision.
          </p>
        ) : null}
        {submitState.status !== 'idle' && submitState.status !== 'submitting' ? (
          <p className="rounded-control border border-warning/50 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
            {submitState.message}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={!pending || submitState.status === 'submitting'}>
            {submitState.status === 'submitting' ? 'Committing decision…' : 'Commit Evidence decision'}
          </Button>
          {submitState.status === 'conflict' ? (
            <Button type="button" variant="secondary" onClick={reload}>
              Reload current state
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
