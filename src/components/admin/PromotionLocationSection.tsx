import type { CandidateSourceSnapshot } from '../../admin/candidates/detail';
import {
  reviewOnlySocialValues,
  serializeAmenitiesFormValue,
  serializeSocialLinksFormValue,
} from '../../admin/promotion/practical-profile-form';
import { PromotionFormField as Field } from './PromotionFormField';

type Snapshot = Extract<CandidateSourceSnapshot, { kind: 'physical_place' }>;

function TextAreaField({
  label,
  name,
  defaultValue,
  rows = 5,
  help,
}: {
  label: string;
  name: string;
  defaultValue: string;
  rows?: number;
  help?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      {help ? <span className="text-xs font-normal leading-5 text-muted">{help}</span> : null}
      <textarea
        className="min-h-28 rounded-control border border-border bg-white px-3 py-2 font-normal text-ink"
        name={name}
        defaultValue={defaultValue}
        rows={rows}
      />
    </label>
  );
}

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
  const reviewOnlySocials = reviewOnlySocialValues(snapshot?.socialLinks);

  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <h2 className="m-0 text-xl font-semibold text-ink">Canonical location</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
        Review source values before commit. Promotion creates a hidden canonical Location and does
        not verify or publish the payment Claim.
      </p>

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
        <Field label="Phone" name="phone" defaultValue={snapshot?.phone ?? ''} />
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

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <TextAreaField
          label="Description"
          name="description"
          defaultValue={snapshot?.description ?? ''}
          rows={6}
          help="Reviewed public description. Empty means unavailable, not a negative fact."
        />
        <TextAreaField
          label="Opening hours"
          name="openingHours"
          defaultValue={snapshot?.openingHours ?? ''}
          rows={6}
          help="Reviewed source text only. This does not enable a real-time Open now calculation."
        />
        <TextAreaField
          label="Amenities"
          name="amenities"
          defaultValue={serializeAmenitiesFormValue(snapshot?.amenities)}
          rows={6}
          help="One value per line or comma-separated. Exact duplicates are collapsed deterministically."
        />
        <TextAreaField
          label="Official social links"
          name="socialLinks"
          defaultValue={serializeSocialLinksFormValue(snapshot?.socialLinks)}
          rows={6}
          help="One per line: platform | https://url | optional handle. Canonical links require HTTPS."
        />
      </div>

      {reviewOnlySocials.length > 0 ? (
        <section className="mt-5 rounded-control border border-warning/50 bg-amber-50 p-4">
          <h3 className="m-0 text-sm font-semibold text-amber-950">Source-only social values</h3>
          <p className="mt-2 text-xs leading-5 text-amber-900">
            These source values are reviewable but were not prefilled because the canonical
            social-link contract requires an HTTPS URL. Do not invent a URL from a handle.
          </p>
          <ul className="mt-3 grid gap-1 pl-5 text-sm text-amber-950">
            {reviewOnlySocials.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
