import { Trash2 } from 'lucide-react';
import type { CandidatePromotionWorkspaceResponse } from '../../admin/promotion/workspace';
import { Button } from '../ui/Button';
import type { PromotionAssetRow } from './PromotionAssetTypes';

export function PromotionAssetRowEditor({
  workspace,
  row,
  index,
  update,
  selectPrimary,
  remove,
}: {
  workspace: CandidatePromotionWorkspaceResponse;
  row: PromotionAssetRow;
  index: number;
  update: (patch: Partial<PromotionAssetRow>) => void;
  selectPrimary: () => void;
  remove: () => void;
}) {
  return (
    <article className="rounded-control border border-border bg-canvas p-4">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Asset
          <select
            value={row.assetId}
            onChange={(event) => update({ assetId: event.target.value })}
            required
            className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
          >
            <option value="">Select asset</option>
            {workspace.registries.assets.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Network
          <select
            value={row.networkId}
            onChange={(event) => update({ networkId: event.target.value })}
            required
            className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
          >
            <option value="">Select network</option>
            {workspace.registries.networks.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Payment method
          <select
            value={row.paymentMethodId}
            onChange={(event) => update({ paymentMethodId: event.target.value })}
            required
            className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
          >
            <option value="">Select method</option>
            {workspace.registries.paymentMethods.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Contract address
          <input
            value={row.contractAddress}
            onChange={(event) => update({ contractAddress: event.target.value })}
            className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Notes
          <input
            value={row.notes}
            onChange={(event) => update({ notes: event.target.value })}
            className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 text-sm font-medium text-ink">
          <input
            type="radio"
            name="primaryAsset"
            checked={row.isPrimary}
            onChange={selectPrimary}
          />{' '}
          Primary combination
        </label>
        <Button
          type="button"
          variant="ghost"
          onClick={remove}
          aria-label={`Remove asset combination ${index + 1}`}
        >
          <Trash2 className="size-4" /> Remove
        </Button>
      </div>
    </article>
  );
}
