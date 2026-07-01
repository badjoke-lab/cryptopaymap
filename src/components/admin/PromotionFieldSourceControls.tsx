import { useEffect, useMemo, useState } from 'react';
import type {
  PromotionFieldDescriptor,
  PromotionFieldSourceSelections,
} from '../../admin/promotion/field-source-selection';

interface SourceOption {
  id: string;
  sourceName: string;
  sourceType: string;
  sourceUrl: string | null;
}

export function PromotionFieldSourceControls({
  fields,
  sources,
}: {
  fields: readonly PromotionFieldDescriptor[];
  sources: readonly SourceOption[];
}) {
  const sourceIds = useMemo(() => sources.map((source) => source.id), [sources]);
  const [selections, setSelections] = useState<PromotionFieldSourceSelections>({});

  useEffect(() => {
    setSelections((current) =>
      Object.fromEntries(
        fields.map((field) => {
          const selected = current[field.key];
          return [
            field.key,
            selected === undefined
              ? sourceIds
              : selected.filter((sourceId) => sourceIds.includes(sourceId)),
          ];
        }),
      ),
    );
  }, [fields, sourceIds]);

  function toggle(fieldKey: string, sourceId: string, checked: boolean) {
    setSelections((current) => {
      const selected = new Set(current[fieldKey] ?? []);
      if (checked) selected.add(sourceId);
      else selected.delete(sourceId);
      return { ...current, [fieldKey]: [...selected].sort() };
    });
  }

  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl font-semibold text-ink">Field source assignments</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Choose which reviewed Candidate sources support each factual field. Every non-empty field
            requires at least one source before promotion can be committed.
          </p>
        </div>
        <span className="rounded-pill border border-border bg-canvas px-3 py-1 text-xs font-medium text-muted">
          Origin provenance
        </span>
      </div>

      <input type="hidden" name="provenanceSelections" value={JSON.stringify(selections)} />

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {fields.map((field) => {
          const selected = selections[field.key] ?? [];
          return (
            <fieldset
              key={field.key}
              className="rounded-control border border-border bg-canvas p-4"
            >
              <legend className="px-1 text-sm font-semibold text-ink">{field.label}</legend>
              <div className="mt-2 grid gap-2">
                {sources.map((source) => (
                  <label key={source.id} className="flex items-start gap-3 text-sm text-ink">
                    <input
                      className="mt-0.5 size-4"
                      type="checkbox"
                      checked={selected.includes(source.id)}
                      onChange={(event) => toggle(field.key, source.id, event.target.checked)}
                    />
                    <span>
                      <span className="font-medium">{source.sourceName}</span>
                      <span className="ml-2 text-xs text-muted">{source.sourceType}</span>
                      {source.sourceUrl ? (
                        <a
                          className="ml-2 text-xs font-semibold text-brand-700"
                          href={source.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open source
                        </a>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
              {selected.length === 0 ? (
                <p className="mt-3 text-xs font-semibold text-red-700">No source selected</p>
              ) : (
                <p className="mt-3 text-xs text-muted">
                  {selected.length} source{selected.length === 1 ? '' : 's'} assigned
                </p>
              )}
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}
