import { PromotionFormField as Field } from './PromotionFormField';

type Snapshot = {
  addressLine: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string;
  latitude: number;
  longitude: number;
  websiteUrl: string | null;
  osmType: 'node' | 'way' | 'relation' | null;
  osmId: string | number | null;
};

export function LocationSection({
  defaultName,
  defaultSlug,
  snapshot,
}: {
  defaultName: string;
  defaultSlug: string;
  snapshot: Snapshot | null;
}) {
  const textFields = [
    ['Address', 'addressLine', snapshot?.addressLine ?? ''],
    ['Locality', 'locality', snapshot?.locality ?? ''],
    ['Region', 'region', snapshot?.region ?? ''],
    ['Postal code', 'postalCode', snapshot?.postalCode ?? ''],
  ] as const;
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <h2 className="m-0 text-xl font-semibold text-ink">Canonical location</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Location name" name="locationName" defaultValue={defaultName} />
        <Field label="Location slug" name="locationSlug" defaultValue={defaultSlug} required />
        {textFields.map(([label, name, defaultValue]) => (
          <Field key={name} label={label} name={name} defaultValue={defaultValue} />
        ))}
        <Field
          label="Country code"
          name="locationCountryCode"
          defaultValue={snapshot?.countryCode ?? ''}
          required
        />
        <Field
          label="Latitude"
          name="latitude"
          type="number"
          step="any"
          min={-90}
          max={90}
          defaultValue={snapshot?.latitude ?? ''}
          required
        />
        <Field
          label="Longitude"
          name="longitude"
          type="number"
          step="any"
          min={-180}
          max={180}
          defaultValue={snapshot?.longitude ?? ''}
          required
        />
        <Field
          label="HTTPS website"
          name="locationWebsiteUrl"
          type="url"
          defaultValue={snapshot?.websiteUrl ?? ''}
        />
        <Field label="Phone" name="phone" />
        <label className="grid gap-2 text-sm font-semibold text-ink">
          OSM type
          <select
            name="osmType"
            defaultValue={snapshot?.osmType ?? ''}
            className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
          >
            <option value="">None</option>
            <option value="node">Node</option>
            <option value="way">Way</option>
            <option value="relation">Relation</option>
          </select>
        </label>
        <Field
          label="OSM ID"
          name="osmId"
          type="number"
          min={1}
          defaultValue={snapshot?.osmId ?? ''}
        />
      </div>
    </section>
  );
}
