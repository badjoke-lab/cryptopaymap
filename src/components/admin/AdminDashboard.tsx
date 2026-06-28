import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileSearch,
  ImageIcon,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { adminDashboardSummarySchema, type AdminDashboardSummary } from '../../admin/dashboard/summary';
import { Button } from '../ui/Button';

const numberFormatter = new Intl.NumberFormat('en-US');
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

type DashboardState =
  | { status: 'loading' }
  | { status: 'ready'; summary: AdminDashboardSummary }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'error' };

function formatCount(value: number): string {
  return numberFormatter.format(value);
}

function formatTimestamp(value: string | null): string {
  if (value === null) return 'No completed import yet';
  return `${dateFormatter.format(new Date(value))} UTC`;
}

function StatCard({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: number | string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <article className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="m-0 text-sm font-semibold text-muted">{title}</h2>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">
            {typeof value === 'number' ? formatCount(value) : value}
          </p>
        </div>
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-control bg-brand-50 text-brand-700"
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">{detail}</p>
    </article>
  );
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

export function AdminDashboard() {
  const [state, setState] = useState<DashboardState>({ status: 'loading' });
  const [requestVersion, setRequestVersion] = useState(0);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setRequestVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      try {
        const response = await fetch('/admin/api/dashboard', {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        if (response.status === 403) {
          setState({ status: 'denied' });
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

        const result = adminDashboardSummarySchema.safeParse(await response.json());
        setState(result.success ? { status: 'ready', summary: result.data } : { status: 'error' });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ status: 'error' });
      }
    }

    void loadDashboard();
    return () => controller.abort();
  }, [requestVersion]);

  if (state.status === 'loading') {
    return (
      <StatusPanel
        title="Loading operational summary"
        description="The protected dashboard is requesting bounded queue totals. No record details are loaded by this view."
        icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
      />
    );
  }

  if (state.status === 'denied') {
    return (
      <StatusPanel
        title="Dashboard access denied"
        description="Your verified administration identity does not have the dashboard read capability. No operational counts were returned."
        icon={<ShieldAlert className="size-5" />}
      />
    );
  }

  if (state.status === 'unavailable') {
    return (
      <StatusPanel
        title="Dashboard unavailable"
        description="The protected summary service is not configured or could not complete safely. Try again after the administration environment is available."
        icon={<AlertTriangle className="size-5" />}
        action={
          <Button variant="secondary" onClick={retry}>
            Retry summary
          </Button>
        }
      />
    );
  }

  if (state.status === 'error') {
    return (
      <StatusPanel
        title="Dashboard response could not be verified"
        description="The summary response was incomplete or invalid. No unverified values are displayed."
        icon={<AlertTriangle className="size-5" />}
        action={
          <Button variant="secondary" onClick={retry}>
            Retry summary
          </Button>
        }
      />
    );
  }

  const { summary } = state;
  const hasOperationalWork =
    summary.candidateQueue.totalActionable > 0 ||
    summary.evidenceReview.pending > 0 ||
    summary.rechecks.overdue > 0 ||
    summary.rechecks.dueSoon > 0 ||
    summary.rechecks.stale > 0 ||
    summary.mediaReview.pending > 0;

  return (
    <div aria-live="polite">
      {!hasOperationalWork ? (
        <div className="mb-5 flex items-start gap-3 rounded-card border border-confirmed/30 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p className="m-0 leading-6">
            No actionable review work is currently reported by the bounded dashboard summary.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="Candidate review"
          value={summary.candidateQueue.totalActionable}
          detail={`${formatCount(summary.candidateQueue.new)} new · ${formatCount(summary.candidateQueue.triaged)} triaged · ${formatCount(summary.candidateQueue.highPriority)} high priority`}
          icon={<UsersRound className="size-5" />}
        />
        <StatCard
          title="Open duplicate groups"
          value={summary.candidateQueue.openDuplicateGroups}
          detail={`${formatCount(summary.candidateQueue.linked)} candidates are linked to a canonical target.`}
          icon={<FileSearch className="size-5" />}
        />
        <StatCard
          title="Evidence review"
          value={summary.evidenceReview.pending}
          detail="Pending Evidence decisions. Evidence content is not returned by this dashboard."
          icon={<FileSearch className="size-5" />}
        />
        <StatCard
          title="Rechecks"
          value={summary.rechecks.overdue + summary.rechecks.dueSoon}
          detail={`${formatCount(summary.rechecks.overdue)} overdue · ${formatCount(summary.rechecks.dueSoon)} due within 30 days · ${formatCount(summary.rechecks.stale)} stale`}
          icon={<Clock3 className="size-5" />}
        />
        <StatCard
          title="Media review"
          value={summary.mediaReview.pending}
          detail="Pending media decisions. Storage keys and private files are not exposed."
          icon={<ImageIcon className="size-5" />}
        />
        <StatCard
          title="Public release"
          value="Unavailable"
          detail="Release controls are intentionally disabled until P3-11."
          icon={<UploadCloud className="size-5" />}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
          <h2 className="m-0 text-lg font-semibold tracking-tight text-ink">Latest import</h2>
          <p className="mt-2 text-sm text-muted">{formatTimestamp(summary.imports.lastCompletedAt)}</p>
          <dl className="mt-5 grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Accepted</dt>
              <dd className="mt-1 text-xl font-semibold text-ink">
                {formatCount(summary.imports.latestAcceptedCount)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Rejected</dt>
              <dd className="mt-1 text-xl font-semibold text-ink">
                {formatCount(summary.imports.latestRejectedCount)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Duplicate signals</dt>
              <dd className="mt-1 text-xl font-semibold text-ink">
                {formatCount(summary.imports.latestDuplicateSignalCount)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="m-0 text-lg font-semibold tracking-tight text-ink">Recent activity</h2>
            <span className="text-xs text-muted">Generated {formatTimestamp(summary.generatedAt)}</span>
          </div>
          {summary.recentActivity.length === 0 ? (
            <p className="mt-4 text-sm leading-6 text-muted">No verification events are available.</p>
          ) : (
            <ol className="mt-4 grid gap-3">
              {summary.recentActivity.map((event, index) => (
                <li
                  key={`${event.eventType}-${event.effectiveAt}-${index}`}
                  className="flex items-center justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0"
                >
                  <span className="text-sm font-medium text-ink">
                    {event.eventType.replaceAll('_', ' ')}
                  </span>
                  <time className="text-xs text-muted" dateTime={event.effectiveAt}>
                    {formatTimestamp(event.effectiveAt)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
