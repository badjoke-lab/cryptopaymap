type LimitedTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  rows?: number;
  helperText?: string;
  error?: string;
  className?: string;
};

export default function LimitedTextarea({
  value,
  onChange,
  maxLength,
  rows = 3,
  helperText,
  error,
  className,
}: LimitedTextareaProps) {
  return (
    <>
      <textarea
        className={className ?? "w-full rounded-md border px-3 py-2"}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
      />
      {helperText ? <p className="text-xs text-gray-500">{helperText}</p> : null}
      <p className="text-xs text-gray-500">{value.length} / {maxLength}</p>
      {error ? <p className="text-red-600 text-sm">{error}</p> : null}
    </>
  );
}
