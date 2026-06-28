import type { CandidateDetailSource, CandidateSourceSnapshot } from '../../admin/candidates/detail';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

function formatDate(value: string | null): string {
  return value === null ? 'Not recorded' : `${dateFormatter.format(new Date(value))} UTC`;
}

function Field({ term, value }: { term: string; value: string | number | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{term}</dt>
      <dd className="mt-1 break-words text-sm text-ink">{value ?? 'Not recorded'}</dd>
    </div>
  );
}

function snapshotFields(
  snapshot: CandidateSourceSnapshot,
): Array<[string, string | number | null]> {
  if (snapshot.kind === 'physical_place') {
    const location = [snapshot.addressLine, snapshot.locality, snapshot.region, snapshot.postalCode]
      .filter((value): value is string => value !== null)
      .join(', ');
    return [
      ['Source name', snapshot.name],
      ['Location', location || null],
      ['Country', snapshot.countryCode],
      ['Coordinates', `${snapshot.latitude}, ${snapshot.longitude}`],
      ['Category', snapshot.category],
      ['Website', snapshot.websiteUrl],
      [
        'OSM identity',
        snapshot.osmType && snapshot.osmId ? `${snapshot.osmType}/${snapshot.osmId}` : null,
      ],
      ['Payment tags', Object.keys(snapshot.paymentTags).join(', ') || null],
      ['Legacy verification', snapshot.legacyVerificationLabel],
    ];
  }

  return [
    ['Source name', snapshot.name],
    ['Record type', snapshot.recordType],
    ['Country', snapshot.countryCode],
    ['Category', snapshot.category],
    ['Acceptance scope', snapshot.acceptanceScope],
    ['Route type', snapshot.routeType],
    ['Processor', snapshot.processorName],
    ['Assets', snapshot.assetLabels.join(', ') || null],
    ['Networks', snapshot.networkLabels.join(', ') || null],
    ['Payment methods', snapshot.paymentMethodLabels.join(', ') || null],
    ['How to pay', snapshot.howToPay],
    ['Legacy verification', snapshot.legacyVerificationLabel],
  ];
}

export function CandidateSourcePanel({ source }: { source: CandidateDetailSource }) {
  const fields = source.snapshot ? snapshotFields(source.snapshot) : [];

  return (
    <article className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
            {source.relationship}
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-ink">
            {source.sourceName}
          </h3>
          <p className="mt-1 text-sm text-muted">{source.sourceType}</p>
        </div>
        <span className="rounded-pill border border-border px-3 py-1 text-xs font-semibold text-muted">
          {source.snapshot ? 'Snapshot verified' : 'Metadata only'}
        </span>
      </div>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field term="Observed" value={formatDate(source.observedAt)} />
        <Field term="Published" value={formatDate(source.publishedAt)} />
        <Field term="Fetched" value={formatDate(source.fetchedAt)} />
        <Field term="License" value={source.license?.name ?? null} />
      </dl>

      {source.sourceUrl || source.archiveUrl ? (
        <div className="mt-5 flex flex-wrap gap-3">
          {source.sourceUrl ? (
            <a
              className="inline-flex min-h-11 items-center rounded-control border border-border px-4 py-2 text-sm font-semibold text-brand-700 no-underline"
              href={source.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              Open source
            </a>
          ) : null}
          {source.archiveUrl ? (
            <a
              className="inline-flex min-h-11 items-center rounded-control border border-border px-4 py-2 text-sm font-semibold text-brand-700 no-underline"
              href={source.archiveUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              Open archive
            </a>
          ) : null}
        </div>
      ) : null}

      <section
        className="mt-6 border-t border-border pt-5"
        aria-label="Allowlisted source snapshot"
      >
        <h4 className="m-0 text-base font-semibold text-ink">Allowlisted source snapshot</h4>
        {source.snapshot === null ? (
          <p className="mt-2 text-sm leading-6 text-muted">
            The payload is unknown or did not validate against a supported import schema. Raw JSON
            is not displayed.
          </p>
        ) : (
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {fields.map(([term, value]) => (
              <Field key={term} term={term} value={value} />
            ))}
          </dl>
        )}
      </section>
    </article>
  );
}
