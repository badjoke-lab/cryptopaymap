import { useState } from 'react';

const statusTokens = [
  { label: 'Confirmed', className: 'bg-confirmed/10 text-confirmed' },
  { label: 'Stale', className: 'bg-stale/10 text-stale' },
  { label: 'Ended', className: 'bg-ended/10 text-ended' },
];

export function FoundationStatus() {
  const [expanded, setExpanded] = useState(false);

  return (
    <section
      className="rounded-card border border-border bg-surface p-5 shadow-panel sm:p-6"
      aria-labelledby="foundation-status-title"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <p className="m-0 text-sm font-semibold text-brand-700">Interactive foundation</p>
          <h2 id="foundation-status-title" className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            Static-first shell, React where interaction needs it
          </h2>
          <p className="mt-3 text-base leading-7 text-muted">
            Astro renders the public shell. React is reserved for coordinated application areas such as maps,
            filters, bottom sheets, and review workflows.
          </p>
        </div>

        <button
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-control bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls="foundation-details"
        >
          {expanded ? 'Hide details' : 'Show details'}
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" aria-label="Status token examples">
        {statusTokens.map((status) => (
          <span key={status.label} className={`rounded-pill px-3 py-1 text-sm font-semibold ${status.className}`}>
            {status.label}
          </span>
        ))}
      </div>

      {expanded ? (
        <ul id="foundation-details" className="mt-5 grid gap-3 text-sm text-muted sm:grid-cols-2">
          <li className="rounded-control bg-canvas p-3">Strict TypeScript configuration</li>
          <li className="rounded-control bg-canvas p-3">Static output baseline</li>
          <li className="rounded-control bg-canvas p-3">React integration for interactive surfaces</li>
          <li className="rounded-control bg-canvas p-3">No runtime database dependency for this page</li>
        </ul>
      ) : null}
    </section>
  );
}
