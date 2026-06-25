import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/classnames';

interface FieldFrameProps {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  optional?: boolean | undefined;
  children: ReactNode;
  className?: string | undefined;
}

export function FieldFrame({
  id,
  label,
  hint,
  error,
  optional = false,
  children,
  className,
}: FieldFrameProps) {
  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-sm font-semibold text-ink" htmlFor={id}>
          {label}
        </label>
        {optional ? <span className="text-xs text-muted">Optional</span> : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="m-0 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="m-0 text-sm leading-6 text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'aria-invalid' | 'aria-describedby'> {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  optional?: boolean | undefined;
  fieldClassName?: string | undefined;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { id, label, hint, error, optional, fieldClassName, className, ...props },
  ref,
) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <FieldFrame
      id={id}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      className={fieldClassName}
    >
      <input
        ref={ref}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={cn(
          'min-h-11 w-full rounded-control border bg-surface px-3 py-2 text-base text-ink shadow-sm',
          'placeholder:text-muted/70 focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-50',
          'disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted',
          error ? 'border-danger' : 'border-border',
          className,
        )}
        {...props}
      />
    </FieldFrame>
  );
});
