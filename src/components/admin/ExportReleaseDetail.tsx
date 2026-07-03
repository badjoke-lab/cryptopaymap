import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  exportReleaseDetailResponseSchema,
  type ExportReleaseDetailResponse,
} from '../../admin/export-release/workspace';
import { Button } from '../ui/Button';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; detail: ExportReleaseDetailResponse }
  | { status: 'missing_digest' | 'denied' | 'not_found' | 'unavailable' | 'error' };

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; message: string }
  | { status: 'invalid' | 'conflict' | 'denied' | 'unavailable'; message: string };

type ReleaseAction = 'approve' | 'reject';

function label(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function shortDigest(value: string): string {
  return `${value.slice(0, 16)}…${value.slice(-16)}`;
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

export function ExportReleaseDetail() {
  const [digest, setDigest] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    setDigest(new URLSearchParams(window.location.search).get('digest'));
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (digest === undefined) return;
      if (!digest) {
        setState({ status: 'missing_digest' });
        return;
      }
      setState({ status: 'loading' });
      try {
        const response = await fetch(
          `/admin/api/export-detail?snapshotDigest=${encodeURIComponent(digest)}`,
          {
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
            signal: signal ?? null,
          },
        );
        if (response.status === 403) return setState({ status: 'denied' });
        if (response.status === 404) return setState({ status: 'not_found' });
        if (response.status === 400) return setState({ status: 'missing_digest' });
        if (response.status === 503) return setState({ status: 'unavailable' });
        if (!response.ok) return setState({ status: 'error' });
        const parsed = exportReleaseDetailResponseSchema.safeParse(await response.json());
        setState(parsed.success ? { status: 'ready', detail: parsed.data } : { status: 'error' });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ status: 'error' });
      }
    },
    [digest],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <StatusPanel
        title="Loading release candidate"
        description="The protected service is revalidating the private artifact bundle and exact snapshot digest."
        icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
      />
    );
  }

  if (state.status !== 'ready') {
    const copy = {
      missing_digest: [
        'Snapshot digest required',
        'Return to the export queue and choose the current candidate.',
      ],
      denied: [
        'Export release access denied',
        'This verified identity cannot read release candidates.',
      ],
      not_found: [
        'Release candidate not found',
        'The private candidate changed or is no longer current.',
      ],
      unavailable: [
        'Release workspace unavailable',
        'The private source or durable release service could not be verified.',
      ],
      error: [
        'Release response could not be verified',
        'No unverified artifact information is displayed.',
      ],
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
              Retry candidate
            </Button>
          ) : (
            <a className="text-sm font-semibold text-brand-700" href="/admin/exports/">
              Return to export queue
            </a>
          )
        }
      />
    );
  }

  return <ExportReleaseWorkspace detail={state.detail} reload={() => void load()} />;
}

function ExportReleaseWorkspace({
  detail,
  reload,
}: {
  detail: ExportReleaseDetailResponse;
  reload: () => void;
}) {
  const candidate = detail.candidate;
  const availableActions = useMemo<ReleaseAction[]>(() => {
    if (candidate.metadata === null) return [];
    return candidate.status === 'eligible' ? ['approve', 'reject'] : ['reject'];
  }, [candidate.metadata, candidate.status]);
  const [action, setAction] = useState<ReleaseAction>(availableActions[0] ?? 'reject');
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (candidate.metadata === null) return;
    setSubmitState({ status: 'submitting' });
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' ? value.trim() : '';
    };
    const body = {
      action,
      expectedSnapshotDigest: candidate.snapshotDigest,
      expectedArtifactCount: candidate.artifactCount,
      expectedDatasetVersion: candidate.metadata.datasetVersion,
      expectedSchemaVersion: candidate.metadata.schemaVersion,
      expectedGeneratedAt: candidate.metadata.generatedAt,
      reasonCode: text('reasonCode'),
      publicSummary: text('publicSummary') || null,
      internalNote: text('internalNote') || null,
    };

    try {
      const response = await fetch('/admin/api/export-decision', {
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
        return setSubmitState({
          status: 'denied',
          message: 'This identity cannot decide export releases.',
        });
      }
      if (response.status === 400) {
        const result = (await response.json()) as { issues?: string[] };
        return setSubmitState({
          status: 'invalid',
          message: result.issues?.[0] ?? 'The export release decision was rejected.',
        });
      }
      if (response.status === 409) {
        return setSubmitState({
          status: 'conflict',
          message:
            'The candidate changed, is blocked, or conflicts with durable release state. Reload before retrying.',
        });
      }
      if (!response.ok) {
        return setSubmitState({
          status: 'unavailable',
          message: 'The export release service is unavailable.',
        });
      }
      const receipt = (await response.json()) as {
        releaseStatus: string;
        state: string;
        datasetVersion: string;
      };
      setSubmitState({
        status: 'success',
        message: `${receipt.datasetVersion} is ${label(receipt.releaseStatus)}. Receipt ${label(receipt.state)}.`,
      });
    } catch {
      setSubmitState({
        status: 'unavailable',
        message: 'The export release request could not be completed.',
      });
    }
  }

  if (submitState.status === 'success') {
    return (
      <StatusPanel
        title="Export release decision committed"
        description={submitState.message}
        icon={<CheckCircle2 className="size-5" />}
        action={
          <div className="flex flex-wrap gap-4">
            <Button variant="secondary" onClick={reload}>
              Reload durable state
            </Button>
            <a className="self-center text-sm font-semibold text-brand-700" href="/admin/exports/">
              Return to export queue
            </a>
          </div>
        }
      />
    );
  }

  return (
    <div>
      <a className="text-sm font-semibold text-brand-700" href="/admin/exports/">
        ← Export queue
      </a>

      <section className="mt-5 rounded-card border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
              {label(candidate.status)} candidate
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              {candidate.metadata?.datasetVersion ?? 'Release metadata unavailable'}
            </h2>
          </div>
          <span className="rounded-pill border border-border bg-canvas px-3 py-1 text-xs font-semibold text-muted">
            {candidate.artifactCount} artifacts · {candidate.validationIssues.length} issues
          </span>
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="font-semibold text-ink">Snapshot digest</dt>
            <dd className="mt-1 font-mono text-xs text-muted">
              {shortDigest(candidate.snapshotDigest)}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Schema</dt>
            <dd className="mt-1 text-muted">
              {candidate.metadata?.schemaVersion ?? 'Unavailable'}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Generated</dt>
            <dd className="mt-1 text-muted">{candidate.metadata?.generatedAt ?? 'Unavailable'}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">History entries</dt>
            <dd className="mt-1 text-muted">{detail.decisions.length}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6" aria-labelledby="validation-issues-title">
        <h2 id="validation-issues-title" className="text-2xl font-semibold text-ink">
          Validation result
        </h2>
        {candidate.validationIssues.length === 0 ? (
          <p className="mt-4 rounded-card border border-confirmed bg-brand-50 p-4 text-sm text-ink">
            The current artifact set passed the public export boundary.
          </p>
        ) : (
          <ul className="mt-4 grid gap-2 rounded-card border border-danger bg-surface p-5 text-sm text-ink">
            {candidate.validationIssues.map((issue) => (
              <li key={issue} className="break-words">
                {issue}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6" aria-labelledby="artifact-inventory-title">
        <h2 id="artifact-inventory-title" className="text-2xl font-semibold text-ink">
          Artifact inventory
        </h2>
        <div className="mt-4 overflow-x-auto rounded-card border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-canvas text-ink">
              <tr>
                <th className="p-3">Path</th>
                <th className="p-3">Type</th>
                <th className="p-3">Records</th>
                <th className="p-3">Bytes</th>
                <th className="p-3">SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {detail.artifacts.map((artifact) => (
                <tr key={artifact.path} className="border-t border-border align-top">
                  <td className="p-3 font-semibold text-ink">{artifact.path}</td>
                  <td className="p-3 text-muted">{artifact.mediaType}</td>
                  <td className="p-3 text-muted">{artifact.recordCount ?? '—'}</td>
                  <td className="p-3 text-muted">{artifact.canonicalByteSize.toLocaleString()}</td>
                  <td className="max-w-72 break-all p-3 font-mono text-xs text-muted">
                    {artifact.sha256}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {availableActions.length === 0 ? (
        <div className="mt-6">
          <StatusPanel
            title="Candidate cannot be decided"
            description="Valid release metadata is unavailable. Regenerate the private candidate before recording a decision."
            icon={<AlertTriangle className="size-5" />}
          />
        </div>
      ) : (
        <form
          className="mt-6 rounded-card border border-border bg-surface p-5 shadow-sm"
          onSubmit={submit}
        >
          <h2 className="text-2xl font-semibold text-ink">Release decision</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-ink">
              Action
              <select
                className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                value={action}
                onChange={(event) => setAction(event.target.value as ReleaseAction)}
              >
                {availableActions.map((item) => (
                  <option key={item} value={item}>
                    {label(item)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-ink">
              Reason code
              <input
                key={action}
                required
                name="reasonCode"
                defaultValue={action === 'approve' ? 'release_approved' : 'release_rejected'}
                pattern="[a-z0-9]+(?:_[a-z0-9]+)*"
                className="min-h-11 rounded-control border border-border px-3 py-2 font-normal"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-ink md:col-span-2">
              Public summary
              <textarea
                required
                name="publicSummary"
                rows={2}
                className="rounded-control border border-border px-3 py-2 font-normal"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-ink md:col-span-2">
              Internal note
              <textarea
                name="internalNote"
                rows={3}
                className="rounded-control border border-border px-3 py-2 font-normal"
              />
            </label>
          </div>
          {submitState.status !== 'idle' && submitState.status !== 'submitting' ? (
            <p className="mt-4 text-sm font-semibold text-danger" role="alert">
              {submitState.message}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="submit" disabled={submitState.status === 'submitting'}>
              {submitState.status === 'submitting'
                ? 'Committing decision…'
                : 'Commit release decision'}
            </Button>
            <Button type="button" variant="secondary" onClick={reload}>
              Reload exact candidate
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
