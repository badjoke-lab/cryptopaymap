import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { z } from 'zod';
import {
  parseAmenitiesFormValue,
  parseSocialLinksFormValue,
  serializeAmenitiesFormValue,
  serializeSocialLinksFormValue,
} from '../../admin/promotion/practical-profile-form';
import {
  locationCorrectionWorkspaceResponseSchema,
  type LocationCorrectionWorkspaceResponse,
} from '../../admin/location-correction/workspace';
import type {
  LocationCorrectionChanges,
  LocationCorrectionProvenanceAssignment,
  PracticalLocationCorrectionField,
} from '../../admin/location-correction/decision';
import { Button } from '../ui/Button';

const receiptSchema = z
  .object({
    requestId: z.uuid(),
    locationId: z.uuid(),
    appliedFieldPaths: z.array(z.string()),
    decidedAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    state: z.enum(['committed', 'replayed']),
  })
  .strict();

type WorkspaceState =
  | { status: 'loading' }
  | { status: 'ready'; workspace: LocationCorrectionWorkspaceResponse }
  | { status: 'missing_id' | 'denied' | 'not_found' | 'unavailable' | 'error' };

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'invalid' | 'conflict' | 'unavailable'; message: string }
  | { status: 'success'; message: string };

type ScalarField = Exclude<
  PracticalLocationCorrectionField,
  'amenities' | 'socialLinks'
>;

type ScalarOperation = 'unchanged' | 'set' | 'clear';
type StructuredOperation = 'unchanged' | 'add' | 'remove' | 'replace' | 'clear';

const scalarFields: Array<{
  field: ScalarField;
  label: string;
  multiline?: boolean;
}> = [
  { field: 'addressLine', label: 'Address line' },
  { field: 'locality', label: 'Locality' },
  { field: 'region', label: 'Region' },
  { field: 'postalCode', label: 'Postal code' },
  { field: 'websiteUrl', label: 'Website URL' },
  { field: 'phone', label: 'Phone' },
  { field: 'description', label: 'Description', multiline: true },
  { field: 'openingHours', label: 'Opening hours', multiline: true },
];

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

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function checkedSources(form: FormData, field: PracticalLocationCorrectionField): string[] {
  return form
    .getAll(`source:${field}`)
    .filter((value): value is string => typeof value === 'string');
}

function scalarCurrent(workspace: LocationCorrectionWorkspaceResponse, field: ScalarField): string {
  return workspace.location[field] ?? '';
}

function humanize(value: string): string {
  return value
    .split(/[_-]/)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function SourceControls({
  workspace,
  field,
}: {
  workspace: LocationCorrectionWorkspaceResponse;
  field: PracticalLocationCorrectionField;
}) {
  return (
    <fieldset className="mt-3 rounded-control border border-border bg-canvas p-3">
      <legend className="px-1 text-xs font-semibold text-muted">Correction sources</legend>
      <div className="grid gap-2">
        {workspace.candidate.sources.map((source) => (
          <label key={source.id} className="flex items-start gap-2 text-sm text-ink">
            <input
              className="mt-1"
              type="checkbox"
              name={`source:${field}`}
              value={source.id}
              defaultChecked
            />
            <span>
              <strong>{source.sourceName}</strong>
              <span className="block text-xs text-muted">{humanize(source.sourceType)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function LocationCorrectionEditor() {
  const [ids, setIds] = useState<{ candidateId: string | null; locationId: string | null } | null>(
    null,
  );
  const [state, setState] = useState<WorkspaceState>({ status: 'loading' });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIds({ candidateId: params.get('candidateId'), locationId: params.get('locationId') });
  }, []);

  const loadWorkspace = useCallback(
    async (signal?: AbortSignal) => {
      if (ids === null) return;
      if (!ids.candidateId || !ids.locationId) {
        setState({ status: 'missing_id' });
        return;
      }
      setState({ status: 'loading' });
      try {
        const response = await fetch(
          `/admin/api/location-corrections/${encodeURIComponent(ids.candidateId)}?locationId=${encodeURIComponent(ids.locationId)}`,
          {
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
            signal: signal ?? null,
          },
        );
        if (response.status === 403) return setState({ status: 'denied' });
        if (response.status === 404) return setState({ status: 'not_found' });
        if (response.status === 400) return setState({ status: 'missing_id' });
        if (response.status === 503) return setState({ status: 'unavailable' });
        if (!response.ok) return setState({ status: 'error' });
        const parsed = locationCorrectionWorkspaceResponseSchema.safeParse(await response.json());
        setState(parsed.success ? { status: 'ready', workspace: parsed.data } : { status: 'error' });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ status: 'error' });
      }
    },
    [ids],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspace(controller.signal);
    return () => controller.abort();
  }, [loadWorkspace]);

  if (state.status === 'loading') {
    return (
      <StatusPanel
        title="Loading Location correction workspace"
        description="The protected service is loading the exact Candidate source set and current canonical Location version."
        icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
      />
    );
  }
  if (state.status !== 'ready') {
    const messages = {
      missing_id: ['Correction target required', 'Return to existing-target review and choose a Place.'],
      denied: ['Location correction denied', 'This verified identity cannot correct Location profiles.'],
      not_found: ['Correction context not found', 'The Candidate or canonical Location is unavailable.'],
      unavailable: ['Location correction unavailable', 'The protected service could not complete safely.'],
      error: ['Workspace response could not be verified', 'No unverified correction data is displayed.'],
    } as const;
    const [title, description] = messages[state.status];
    return (
      <StatusPanel
        title={title}
        description={description}
        icon={state.status === 'denied' ? <ShieldAlert className="size-5" /> : <AlertTriangle className="size-5" />}
        action={
          state.status === 'unavailable' || state.status === 'error' ? (
            <Button variant="secondary" onClick={() => void loadWorkspace()}>
              Retry workspace
            </Button>
          ) : (
            <a className="text-sm font-semibold text-brand-700" href="/admin/candidates/">
              Return to Candidate queue
            </a>
          )
        }
      />
    );
  }

  return <CorrectionWorkspace workspace={state.workspace} reload={() => loadWorkspace()} />;
}

function CorrectionWorkspace({
  workspace,
  reload,
}: {
  workspace: LocationCorrectionWorkspaceResponse;
  reload: () => Promise<void>;
}) {
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const [scalarOperations, setScalarOperations] = useState<Record<ScalarField, ScalarOperation>>(
    () => Object.fromEntries(scalarFields.map(({ field }) => [field, 'unchanged'])) as Record<
      ScalarField,
      ScalarOperation
    >,
  );
  const [amenitiesOperation, setAmenitiesOperation] = useState<StructuredOperation>('unchanged');
  const [socialLinksOperation, setSocialLinksOperation] = useState<StructuredOperation>('unchanged');

  const changedFields = useMemo(() => {
    const fields: PracticalLocationCorrectionField[] = scalarFields
      .filter(({ field }) => scalarOperations[field] !== 'unchanged')
      .map(({ field }) => field);
    if (amenitiesOperation !== 'unchanged') fields.push('amenities');
    if (socialLinksOperation !== 'unchanged') fields.push('socialLinks');
    return fields;
  }, [amenitiesOperation, scalarOperations, socialLinksOperation]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState({ status: 'submitting' });
    const form = new FormData(event.currentTarget);
    const changes: LocationCorrectionChanges = {};

    for (const { field } of scalarFields) {
      const operation = scalarOperations[field];
      if (operation === 'unchanged') continue;
      if (operation === 'clear') {
        changes[field] = { operation: 'clear' };
      } else {
        const value = text(form, `value:${field}`);
        if (!value) {
          setSubmitState({ status: 'invalid', message: `${humanize(field)} requires a set value.` });
          return;
        }
        changes[field] = { operation: 'set', value };
      }
    }

    const amenitiesRaw = text(form, 'value:amenities');
    if (amenitiesOperation !== 'unchanged') {
      if (amenitiesOperation === 'clear') {
        changes.amenities = { operation: 'clear' };
      } else {
        const parsed = parseAmenitiesFormValue(amenitiesRaw);
        if (parsed.error || !parsed.value || parsed.value.length === 0) {
          setSubmitState({
            status: 'invalid',
            message: parsed.error ?? 'Amenities operation requires at least one value.',
          });
          return;
        }
        changes.amenities = { operation: amenitiesOperation, values: parsed.value };
      }
    }

    const socialRaw = text(form, 'value:socialLinks');
    if (socialLinksOperation !== 'unchanged') {
      if (socialLinksOperation === 'clear') {
        changes.socialLinks = { operation: 'clear' };
      } else {
        const parsed = parseSocialLinksFormValue(socialRaw);
        if (parsed.error || !parsed.value || parsed.value.length === 0) {
          setSubmitState({
            status: 'invalid',
            message: parsed.error ?? 'Social Links operation requires at least one value.',
          });
          return;
        }
        changes.socialLinks =
          socialLinksOperation === 'remove'
            ? {
                operation: 'remove',
                values: parsed.value.map(({ platform, url }) => ({ platform, url })),
              }
            : { operation: socialLinksOperation, values: parsed.value };
      }
    }

    if (changedFields.length === 0) {
      setSubmitState({ status: 'invalid', message: 'Choose at least one field change.' });
      return;
    }

    const provenanceAssignments: LocationCorrectionProvenanceAssignment[] = [];
    for (const fieldPath of changedFields) {
      const sourceRecordIds = checkedSources(form, fieldPath);
      if (sourceRecordIds.length === 0) {
        setSubmitState({
          status: 'invalid',
          message: `${humanize(fieldPath)} requires at least one correction source.`,
        });
        return;
      }
      provenanceAssignments.push({ fieldPath, sourceRecordIds });
    }

    const publicSummary = text(form, 'publicSummary');
    const internalNote = text(form, 'internalNote');
    if (!publicSummary && !internalNote) {
      setSubmitState({
        status: 'invalid',
        message: 'Provide a public summary or internal note for the correction decision.',
      });
      return;
    }

    try {
      const response = await fetch(
        `/admin/api/location-corrections/${encodeURIComponent(workspace.candidate.candidate.id)}?locationId=${encodeURIComponent(workspace.location.id)}`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({
            expectedCandidateUpdatedAt: workspace.candidate.candidate.updatedAt,
            expectedLocationUpdatedAt: workspace.location.updatedAt,
            changes,
            sourceRecordIds: workspace.candidate.sources.map((source) => source.id),
            provenanceAssignments,
            reasonCode: text(form, 'reasonCode') || 'reviewed_profile_correction',
            publicSummary: publicSummary || null,
            internalNote: internalNote || null,
          }),
        },
      );
      if (response.status === 409) {
        setSubmitState({
          status: 'conflict',
          message: 'The Candidate sources or canonical Location changed. Reload before retrying.',
        });
        return;
      }
      if (response.status === 400) {
        const body = (await response.json()) as { issues?: unknown };
        setSubmitState({
          status: 'invalid',
          message: Array.isArray(body.issues) ? body.issues.join(' · ') : 'The correction was invalid.',
        });
        return;
      }
      if (!response.ok) {
        setSubmitState({ status: 'unavailable', message: 'The correction could not be committed.' });
        return;
      }
      const receipt = receiptSchema.safeParse(await response.json());
      if (!receipt.success) {
        setSubmitState({ status: 'unavailable', message: 'The correction receipt was invalid.' });
        return;
      }
      setSubmitState({
        status: 'success',
        message: `${receipt.data.state === 'replayed' ? 'Replayed' : 'Committed'} correction for ${receipt.data.appliedFieldPaths.map(humanize).join(', ')}.`,
      });
      await reload();
    } catch {
      setSubmitState({ status: 'unavailable', message: 'The correction request could not be completed.' });
    }
  }

  const location = workspace.location;
  return (
    <div>
      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        <a
          className="text-brand-700"
          href={`/admin/candidates/detail/?id=${encodeURIComponent(workspace.candidate.candidate.id)}`}
        >
          ← Candidate detail
        </a>
        <a className="text-brand-700" href={location.canonicalPath}>
          View public path
        </a>
      </div>

      <section className="mt-5 rounded-card border border-border bg-surface p-5 shadow-sm">
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
          Existing canonical Place
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{location.name}</h2>
        <p className="mt-2 text-sm text-muted">
          Version {location.updatedAt} · {workspace.candidate.sources.length} reviewed source record
          {workspace.candidate.sources.length === 1 ? '' : 's'}
        </p>
      </section>

      {!workspace.eligible ? (
        <div className="mt-8">
          <StatusPanel
            title="Correction is blocked"
            description={workspace.eligibilityIssues.map(humanize).join(', ')}
            icon={<AlertTriangle className="size-5" />}
          />
        </div>
      ) : (
        <form className="mt-8 grid gap-6" onSubmit={submit}>
          {scalarFields.map(({ field, label, multiline }) => {
            const operation = scalarOperations[field];
            return (
              <section key={field} className="rounded-card border border-border bg-surface p-5 shadow-sm">
                <div className="grid gap-1">
                  <h3 className="m-0 text-lg font-semibold text-ink">{label}</h3>
                  <p className="m-0 text-sm text-muted">
                    Current: {scalarCurrent(workspace, field) || 'Not set'}
                  </p>
                </div>
                <label className="mt-4 grid gap-2 text-sm font-semibold text-ink">
                  Operation
                  <select
                    className="min-h-11 rounded-control border border-border bg-white px-3 py-2"
                    value={operation}
                    onChange={(event) =>
                      setScalarOperations((current) => ({
                        ...current,
                        [field]: event.target.value as ScalarOperation,
                      }))
                    }
                  >
                    <option value="unchanged">Unchanged</option>
                    <option value="set">Set reviewed value</option>
                    <option value="clear">Clear value</option>
                  </select>
                </label>
                {operation === 'set' ? (
                  multiline ? (
                    <textarea
                      className="mt-3 min-h-32 w-full rounded-control border border-border bg-white px-3 py-2 text-sm text-ink"
                      name={`value:${field}`}
                      defaultValue={scalarCurrent(workspace, field)}
                    />
                  ) : (
                    <input
                      className="mt-3 min-h-11 w-full rounded-control border border-border bg-white px-3 py-2 text-sm text-ink"
                      name={`value:${field}`}
                      defaultValue={scalarCurrent(workspace, field)}
                    />
                  )
                ) : null}
                {operation !== 'unchanged' ? (
                  <SourceControls workspace={workspace} field={field} />
                ) : null}
              </section>
            );
          })}

          <StructuredField
            title="Amenities"
            field="amenities"
            operation={amenitiesOperation}
            onOperation={setAmenitiesOperation}
            defaultValue={serializeAmenitiesFormValue(location.amenities)}
            workspace={workspace}
            help="One value per line or comma-separated."
          />
          <StructuredField
            title="Official social links"
            field="socialLinks"
            operation={socialLinksOperation}
            onOperation={setSocialLinksOperation}
            defaultValue={serializeSocialLinksFormValue(location.socialLinks)}
            workspace={workspace}
            help="One per line: platform | https://url | optional handle. Remove matches platform + URL."
          />

          <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
            <h3 className="m-0 text-lg font-semibold text-ink">Decision record</h3>
            <label className="mt-4 grid gap-2 text-sm font-semibold text-ink">
              Reason code
              <input
                className="min-h-11 rounded-control border border-border bg-white px-3 py-2"
                name="reasonCode"
                defaultValue="reviewed_profile_correction"
                required
              />
            </label>
            <label className="mt-4 grid gap-2 text-sm font-semibold text-ink">
              Public summary
              <textarea
                className="min-h-24 rounded-control border border-border bg-white px-3 py-2"
                name="publicSummary"
              />
            </label>
            <label className="mt-4 grid gap-2 text-sm font-semibold text-ink">
              Internal note
              <textarea
                className="min-h-24 rounded-control border border-border bg-white px-3 py-2"
                name="internalNote"
              />
            </label>
          </section>

          <section className="rounded-card border border-brand-600 bg-brand-50 p-5">
            <h3 className="m-0 text-lg font-semibold text-ink">Before commit</h3>
            <p className="mt-2 text-sm text-muted">
              Changed fields: {changedFields.length > 0 ? changedFields.map(humanize).join(', ') : 'None'}
            </p>
            <p className="mt-2 text-sm text-muted">
              This operation updates canonical private state and correction provenance. Publication remains a separate validated release operation.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={submitState.status === 'submitting'}>
                {submitState.status === 'submitting' ? 'Committing…' : 'Commit reviewed correction'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => void reload()}>
                Reload current versions
              </Button>
            </div>
            {submitState.status !== 'idle' && submitState.status !== 'submitting' ? (
              <p
                className={`mt-4 rounded-control p-3 text-sm ${submitState.status === 'success' ? 'bg-emerald-50 text-emerald-950' : 'bg-amber-50 text-amber-950'}`}
                role="status"
              >
                {submitState.message}
              </p>
            ) : null}
          </section>
        </form>
      )}
    </div>
  );
}

function StructuredField({
  title,
  field,
  operation,
  onOperation,
  defaultValue,
  workspace,
  help,
}: {
  title: string;
  field: 'amenities' | 'socialLinks';
  operation: StructuredOperation;
  onOperation: (operation: StructuredOperation) => void;
  defaultValue: string;
  workspace: LocationCorrectionWorkspaceResponse;
  help: string;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <h3 className="m-0 text-lg font-semibold text-ink">{title}</h3>
      <label className="mt-4 grid gap-2 text-sm font-semibold text-ink">
        Operation
        <select
          className="min-h-11 rounded-control border border-border bg-white px-3 py-2"
          value={operation}
          onChange={(event) => onOperation(event.target.value as StructuredOperation)}
        >
          <option value="unchanged">Unchanged</option>
          <option value="add">Add values</option>
          <option value="remove">Remove values</option>
          <option value="replace">Replace complete set</option>
          <option value="clear">Clear complete set</option>
        </select>
      </label>
      {operation !== 'unchanged' && operation !== 'clear' ? (
        <label className="mt-3 grid gap-2 text-sm text-muted">
          {help}
          <textarea
            className="min-h-32 rounded-control border border-border bg-white px-3 py-2 text-sm text-ink"
            name={`value:${field}`}
            defaultValue={defaultValue}
          />
        </label>
      ) : null}
      {operation !== 'unchanged' ? <SourceControls workspace={workspace} field={field} /> : null}
    </section>
  );
}
