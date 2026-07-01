import { Plus, Trash2 } from 'lucide-react';
import type { CandidatePromotionWorkspaceResponse } from '../../admin/promotion/workspace';
import { Button } from '../ui/Button';

export interface PromotionAssetRow {
  id: string;
  key: string;
  assetId: string;
  networkId: string;
  paymentMethodId: string;
  contractAddress: string;
  notes: string;
  isPrimary: boolean;
}

function Field({
  label,
  name,
  defaultValue = '',
  required = false,
  type = 'text',
  min,
  max,
  step,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  required?: boolean;
  type?: string;
  min?: number;
  max?: number;
  step?: string;
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
        min={min}
        max={max}
        step={step}
      />
    </label>
  );
}

function TextArea({ label, name, defaultValue = '' }: { label: string; name: string; defaultValue?: string }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <textarea
        className="min-h-28 rounded-control border border-border bg-white px-3 py-2 font-normal text-ink"
        name={name}
        defaultValue={defaultValue}
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
      <p className="mt-2 text-sm text-muted">Review every normalized value. The new record remains hidden.</p>
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

export function LocationSection({
  defaultName,
  defaultSlug,
  snapshot,
}: {
  defaultName: string;
  defaultSlug: string;
  snapshot: {
    addressLine: string | null;
    locality: string | null;
    region: string | null;
    postalCode: string | null;
    countryCode: string;
    latitude: number;
    longitude: number;
    websiteUrl: string | null;
    osmType: 'node' | 'way' | 'relation' | null;
    osmId: number | null;
  } | null;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <h2 className="m-0 text-xl font-semibold text-ink">Canonical location</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Location name" name="locationName" defaultValue={defaultName} />
        <Field label="Location slug" name="locationSlug" defaultValue={defaultSlug} required />
        <Field label="Address" name="addressLine" defaultValue={snapshot?.addressLine ?? ''} />
        <Field label="Locality" name="locality" defaultValue={snapshot?.locality ?? ''} />
        <Field label="Region" name="region" defaultValue={snapshot?.region ?? ''} />
        <Field label="Postal code" name="postalCode" defaultValue={snapshot?.postalCode ?? ''} />
        <Field label="Country code" name="locationCountryCode" defaultValue={snapshot?.countryCode ?? ''} required />
        <Field label="Latitude" name="latitude" type="number" step="any" min={-90} max={90} defaultValue={snapshot?.latitude ?? ''} required />
        <Field label="Longitude" name="longitude" type="number" step="any" min={-180} max={180} defaultValue={snapshot?.longitude ?? ''} required />
        <Field label="HTTPS website" name="locationWebsiteUrl" type="url" defaultValue={snapshot?.websiteUrl ?? ''} />
        <Field label="Phone" name="phone" />
        <label className="grid gap-2 text-sm font-semibold text-ink">
          OSM type
          <select className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" name="osmType" defaultValue={snapshot?.osmType ?? ''}>
            <option value="">None</option>
            <option value="node">Node</option>
            <option value="way">Way</option>
            <option value="relation">Relation</option>
          </select>
        </label>
        <Field label="OSM ID" name="osmId" type="number" min={1} defaultValue={snapshot?.osmId ?? ''} />
      </div>
    </section>
  );
}

export function ClaimSection({
  workspace,
  defaults,
}: {
  workspace: CandidatePromotionWorkspaceResponse;
  defaults: { routeType: string; acceptanceScope: string; howToPay: string; restrictions: string };
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <h2 className="m-0 text-xl font-semibold text-ink">Candidate acceptance claim</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Route type
          <select className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" name="routeType" defaultValue={defaults.routeType}>
            <option value="direct_wallet">Direct wallet</option>
            <option value="processor_checkout">Processor checkout</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Acceptance scope
          <select className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" name="acceptanceScope" defaultValue={defaults.acceptanceScope}>
            <option value="all_checkout">All checkout</option>
            <option value="selected_products">Selected products</option>
            <option value="new_purchase_only">New purchase only</option>
            <option value="renewal_only">Renewal only</option>
            <option value="region_limited">Region limited</option>
            <option value="temporary">Temporary</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Processor
          <select className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" name="processorId" defaultValue="">
            <option value="">None</option>
            {workspace.registries.processors.map((processor) => (
              <option key={processor.id} value={processor.id}>{processor.name}</option>
            ))}
          </select>
        </label>
        <Field label="Instructions language" name="instructionsLanguage" defaultValue="en" required />
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Merchant receives
          <select className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" name="merchantReceives" defaultValue="not_publicly_confirmed">
            <option value="crypto">Crypto</option>
            <option value="fiat">Fiat</option>
            <option value="crypto_or_fiat">Crypto or fiat</option>
            <option value="not_publicly_confirmed">Not publicly confirmed</option>
          </select>
        </label>
      </div>
      <div className="mt-5 grid gap-4">
        <TextArea label="How to pay" name="howToPay" defaultValue={defaults.howToPay} />
        <TextArea label="Restrictions" name="restrictions" defaultValue={defaults.restrictions} />
        <label className="flex items-center gap-3 text-sm font-medium text-ink">
          <input className="size-5" type="checkbox" name="customerPaysCrypto" /> Customer pays crypto
        </label>
        <label className="flex items-center gap-3 text-sm font-medium text-ink">
          <input className="size-5" type="checkbox" name="merchantExplicitlyAcceptsCrypto" /> Merchant explicitly accepts crypto
        </label>
      </div>
    </section>
  );
}

export function AssetSection({
  workspace,
  rows,
  setRows,
}: {
  workspace: CandidatePromotionWorkspaceResponse;
  rows: PromotionAssetRow[];
  setRows: React.Dispatch<React.SetStateAction<PromotionAssetRow[]>>;
}) {
  function update(key: string, patch: Partial<PromotionAssetRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }
  function add() {
    const id = crypto.randomUUID();
    setRows((current) => [...current, { id, key: id, assetId: '', networkId: '', paymentMethodId: '', contractAddress: '', notes: '', isPrimary: false }]);
  }
  function remove(key: string) {
    setRows((current) => {
      const next = current.filter((row) => row.key !== key);
      if (next.length === 0) {
        const id = crypto.randomUUID();
        return [{ id, key: id, assetId: '', networkId: '', paymentMethodId: '', contractAddress: '', notes: '', isPrimary: true }];
      }
      if (!next.some((row) => row.isPrimary)) next[0] = { ...next[0], isPrimary: true };
      return next;
    });
  }
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl font-semibold text-ink">Claim asset combinations</h2>
          <p className="mt-2 text-sm text-muted">Choose explicit asset, network, and payment-method identities.</p>
        </div>
        <Button type="button" variant="secondary" onClick={add}><Plus className="size-4" /> Add combination</Button>
      </div>
      <div className="mt-5 grid gap-4">
        {rows.map((row, index) => (
          <article key={row.key} className="rounded-control border border-border bg-canvas p-4">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm font-semibold text-ink">Asset<select className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" value={row.assetId} onChange={(event) => update(row.key, { assetId: event.target.value })} required><option value="">Select asset</option>{workspace.registries.assets.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
              <label className="grid gap-2 text-sm font-semibold text-ink">Network<select className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" value={row.networkId} onChange={(event) => update(row.key, { networkId: event.target.value })} required><option value="">Select network</option>{workspace.registries.networks.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
              <label className="grid gap-2 text-sm font-semibold text-ink">Payment method<select className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" value={row.paymentMethodId} onChange={(event) => update(row.key, { paymentMethodId: event.target.value })} required><option value="">Select method</option>{workspace.registries.paymentMethods.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-ink">Contract address<input className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" value={row.contractAddress} onChange={(event) => update(row.key, { contractAddress: event.target.value })} /></label>
              <label className="grid gap-2 text-sm font-semibold text-ink">Notes<input className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" value={row.notes} onChange={(event) => update(row.key, { notes: event.target.value })} /></label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-3 text-sm font-medium text-ink"><input type="radio" name="primaryAsset" checked={row.isPrimary} onChange={() => setRows((current) => current.map((item) => ({ ...item, isPrimary: item.key === row.key })))} /> Primary combination</label>
              <Button type="button" variant="ghost" onClick={() => remove(row.key)} aria-label={`Remove asset combination ${index + 1}`}><Trash2 className="size-4" /> Remove</Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
