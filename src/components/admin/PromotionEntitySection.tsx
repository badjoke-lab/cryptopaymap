function Field({
  label,
  name,
  defaultValue = '',
  required = false,
  type = 'text',
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <input
        className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal text-ink"
        name={name}
        defaultValue={defaultValue}
        required={required}
        type={type}
      />
    </label>
  );
}

export function EntitySection({
  candidateType,
  defaultName,
  defaultSlug,
  websiteUrl,
  countryCode,
}: {
  candidateType: string;
  defaultName: string;
  defaultSlug: string;
  websiteUrl: string;
  countryCode: string;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <h2 className="m-0 text-xl font-semibold text-ink">Canonical entity</h2>
      <p className="mt-2 text-sm text-muted">
        Review every normalized value. The new record remains hidden.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Display name" name="entityName" defaultValue={defaultName} required />
        <Field
          label="Slug"
          name="entitySlug"
          defaultValue={defaultSlug}
          required={candidateType === 'online_service'}
        />
        <Field label="Legal name" name="legalName" />
        <Field label="HTTPS website" name="entityWebsiteUrl" type="url" defaultValue={websiteUrl} />
        <Field label="Country code" name="entityCountryCode" defaultValue={countryCode} />
      </div>
    </section>
  );
}
