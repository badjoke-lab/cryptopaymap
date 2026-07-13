import type { ReactNode } from 'react';

export interface ReportFormOption {
  value: string;
  label: string;
}

const controlClass =
  'min-h-11 w-full rounded-control border border-border bg-surface px-3 py-2 text-base text-ink shadow-sm focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-50';

function Field({
  id,
  label,
  optional = false,
  hint,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-sm font-semibold text-ink" htmlFor={id}>
          {label}
        </label>
        {optional ? <span className="text-xs text-muted">Optional</span> : null}
      </div>
      {children}
      {hint ? <p className="m-0 text-sm leading-6 text-muted">{hint}</p> : null}
    </div>
  );
}

export function SelectField({
  id,
  label,
  value,
  options,
  optional = false,
  placeholder = 'Select an option',
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: ReportFormOption[];
  optional?: boolean;
  placeholder?: string;
  onChange(value: string): void;
}) {
  return (
    <Field id={id} label={label} optional={optional}>
      <select
        id={id}
        className={controlClass}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function InputField({
  id,
  label,
  value,
  type = 'text',
  maxLength,
  optional = false,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  type?: string;
  maxLength?: number | undefined;
  optional?: boolean;
  hint?: string | undefined;
  onChange(value: string): void;
}) {
  return (
    <Field id={id} label={label} optional={optional} hint={hint}>
      <input
        id={id}
        type={type}
        className={controlClass}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </Field>
  );
}

export function TextAreaField({
  id,
  label,
  value,
  maxLength,
  optional = false,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  maxLength: number;
  optional?: boolean;
  hint?: string | undefined;
  onChange(value: string): void;
}) {
  return (
    <Field id={id} label={label} optional={optional} hint={hint}>
      <textarea
        id={id}
        className={controlClass}
        rows={4}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </Field>
  );
}

export function FormSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-5 rounded-card border border-border bg-surface p-5 shadow-sm sm:p-6">
      <div>
        <p className="m-0 text-sm font-semibold text-brand-700">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}
