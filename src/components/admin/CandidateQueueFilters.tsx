import { ChevronDown, Filter } from 'lucide-react';
import type { ReactNode } from 'react';
import { candidateStatusValues, candidateTypeValues, sourceTypeValues } from '../../db/schema';
import { Button } from '../ui/Button';
import { humanizeCandidateValue } from './CandidateQueueCard';

export interface CandidateQueueFiltersValue {
  status: 'actionable' | 'all' | (typeof candidateStatusValues)[number];
  candidateType: 'all' | (typeof candidateTypeValues)[number];
  sourceType: 'all' | (typeof sourceTypeValues)[number];
  priority: 'all' | 'high' | 'standard' | 'unscored';
  duplicate: 'all' | 'flagged' | 'unflagged';
}

export const defaultCandidateQueueFilters: CandidateQueueFiltersValue = {
  status: 'actionable',
  candidateType: 'all',
  sourceType: 'all',
  priority: 'all',
  duplicate: 'all',
};

export function buildCandidateQueueUrl(
  filters: CandidateQueueFiltersValue,
  cursor?: string,
): string {
  const parameters = new URLSearchParams({ limit: '25' });
  if (filters.status === 'actionable') {
    parameters.set('status', 'new,triaged');
  } else if (filters.status === 'all') {
    parameters.set('status', candidateStatusValues.join(','));
  } else {
    parameters.set('status', filters.status);
  }
  if (filters.candidateType !== 'all') parameters.set('type', filters.candidateType);
  if (filters.sourceType !== 'all') parameters.set('source', filters.sourceType);
  if (filters.priority !== 'all') parameters.set('priority', filters.priority);
  if (filters.duplicate !== 'all') parameters.set('duplicate', filters.duplicate);
  if (cursor) parameters.set('cursor', cursor);
  return `/admin/api/candidates?${parameters.toString()}`;
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange(value: string): void;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink" htmlFor={id}>
      {label}
      <span className="relative">
        <select
          id={id}
          className="min-h-11 w-full appearance-none rounded-control border border-border bg-surface px-3 pr-10 text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
      </span>
    </label>
  );
}

export function CandidateQueueFilters({
  value,
  onChange,
  onSubmit,
  onReset,
}: {
  value: CandidateQueueFiltersValue;
  onChange(value: CandidateQueueFiltersValue): void;
  onSubmit(): void;
  onReset(): void;
}) {
  return (
    <form
      className="rounded-card border border-border bg-surface p-5 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-center gap-2">
        <Filter className="size-5 text-brand-700" aria-hidden="true" />
        <h2 className="m-0 text-lg font-semibold tracking-tight text-ink">Queue filters</h2>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <FilterSelect
          id="candidate-status-filter"
          label="Status"
          value={value.status}
          onChange={(status) =>
            onChange({ ...value, status: status as CandidateQueueFiltersValue['status'] })
          }
        >
          <option value="actionable">New and triaged</option>
          <option value="all">All statuses</option>
          {candidateStatusValues.map((status) => (
            <option key={status} value={status}>
              {humanizeCandidateValue(status)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          id="candidate-type-filter"
          label="Type"
          value={value.candidateType}
          onChange={(candidateType) =>
            onChange({
              ...value,
              candidateType: candidateType as CandidateQueueFiltersValue['candidateType'],
            })
          }
        >
          <option value="all">All types</option>
          {candidateTypeValues.map((candidateType) => (
            <option key={candidateType} value={candidateType}>
              {humanizeCandidateValue(candidateType)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          id="candidate-source-filter"
          label="Source type"
          value={value.sourceType}
          onChange={(sourceType) =>
            onChange({
              ...value,
              sourceType: sourceType as CandidateQueueFiltersValue['sourceType'],
            })
          }
        >
          <option value="all">All sources</option>
          {sourceTypeValues.map((sourceType) => (
            <option key={sourceType} value={sourceType}>
              {humanizeCandidateValue(sourceType)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          id="candidate-priority-filter"
          label="Priority"
          value={value.priority}
          onChange={(priority) =>
            onChange({
              ...value,
              priority: priority as CandidateQueueFiltersValue['priority'],
            })
          }
        >
          <option value="all">All priorities</option>
          <option value="high">High: 800–1000</option>
          <option value="standard">Standard: 0–799</option>
          <option value="unscored">Unscored</option>
        </FilterSelect>
        <FilterSelect
          id="candidate-duplicate-filter"
          label="Duplicate signal"
          value={value.duplicate}
          onChange={(duplicate) =>
            onChange({
              ...value,
              duplicate: duplicate as CandidateQueueFiltersValue['duplicate'],
            })
          }
        >
          <option value="all">All Candidates</option>
          <option value="flagged">Flagged</option>
          <option value="unflagged">Not flagged</option>
        </FilterSelect>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="submit">Apply filters</Button>
        <Button type="button" variant="secondary" onClick={onReset}>
          Reset
        </Button>
      </div>
    </form>
  );
}
