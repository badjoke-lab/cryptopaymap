import type { CandidatePromotionWorkspaceResponse } from '../../admin/promotion/workspace';
import { PromotionFormField as Field } from './PromotionFormField';

function TextArea({
  label,
  name,
  defaultValue = '',
}: {
  label: string;
  name: string;
  defaultValue?: string;
}) {
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

export function ClaimSection({
  workspace,
  defaults,
}: {
  workspace: CandidatePromotionWorkspaceResponse;
  defaults: {
    routeType: string;
    acceptanceScope: string;
    howToPay: string;
    restrictions: string;
  };
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <h2 className="m-0 text-xl font-semibold text-ink">Candidate acceptance claim</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Route type
          <select
            name="routeType"
            defaultValue={defaults.routeType}
            className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
          >
            <option value="direct_wallet">Direct wallet</option>
            <option value="processor_checkout">Processor checkout</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Acceptance scope
          <select
            name="acceptanceScope"
            defaultValue={defaults.acceptanceScope}
            className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
          >
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
          <select
            name="processorId"
            defaultValue=""
            className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
          >
            <option value="">None</option>
            {workspace.registries.processors.map((processor) => (
              <option key={processor.id} value={processor.id}>
                {processor.name}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Instructions language"
          name="instructionsLanguage"
          defaultValue="en"
          required
        />
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Merchant receives
          <select
            name="merchantReceives"
            defaultValue="not_publicly_confirmed"
            className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
          >
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
          <input className="size-5" type="checkbox" name="customerPaysCrypto" /> Customer pays
          crypto
        </label>
        <label className="flex items-center gap-3 text-sm font-medium text-ink">
          <input className="size-5" type="checkbox" name="merchantExplicitlyAcceptsCrypto" />{' '}
          Merchant explicitly accepts crypto
        </label>
      </div>
    </section>
  );
}
