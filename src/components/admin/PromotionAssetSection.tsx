import { Plus } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { CandidatePromotionWorkspaceResponse } from '../../admin/promotion/workspace';
import { Button } from '../ui/Button';
import { PromotionAssetRowEditor } from './PromotionAssetRowEditor';
import type { PromotionAssetRow } from './PromotionAssetTypes';

function createRow(primary: boolean): PromotionAssetRow {
  const id = crypto.randomUUID();
  return {
    id,
    key: id,
    assetId: '',
    networkId: '',
    paymentMethodId: '',
    contractAddress: '',
    notes: '',
    isPrimary: primary,
  };
}

export function AssetSection({
  workspace,
  rows,
  setRows,
}: {
  workspace: CandidatePromotionWorkspaceResponse;
  rows: PromotionAssetRow[];
  setRows: Dispatch<SetStateAction<PromotionAssetRow[]>>;
}) {
  const add = () => setRows((current) => [...current, createRow(false)]);
  const update = (key: string, patch: Partial<PromotionAssetRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const selectPrimary = (key: string) =>
    setRows((current) => current.map((row) => ({ ...row, isPrimary: row.key === key })));
  const remove = (key: string) =>
    setRows((current) => {
      const next = current.filter((row) => row.key !== key);
      if (next.length === 0) return [createRow(true)];
      if (!next.some((row) => row.isPrimary) && next[0] !== undefined) {
        next[0] = { ...next[0], isPrimary: true };
      }
      return next;
    });

  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-xl font-semibold text-ink">Claim asset combinations</h2>
        <Button type="button" variant="secondary" onClick={add}>
          <Plus className="size-4" /> Add combination
        </Button>
      </div>
      <div className="mt-5 grid gap-4">
        {rows.map((row, index) => (
          <PromotionAssetRowEditor
            key={row.key}
            workspace={workspace}
            row={row}
            index={index}
            update={(patch) => update(row.key, patch)}
            selectPrimary={() => selectPrimary(row.key)}
            remove={() => remove(row.key)}
          />
        ))}
      </div>
    </section>
  );
}
