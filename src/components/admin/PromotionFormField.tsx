export function PromotionFormField({
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
