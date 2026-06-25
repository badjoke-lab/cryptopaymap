import { Check, ChevronDown } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import { cn } from '../../lib/classnames';
import { FieldFrame } from './Field';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps {
  id: string;
  label: string;
  options: SelectOption[];
  placeholder?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
  className?: string;
}

export function SelectField({
  id,
  label,
  options,
  placeholder = 'Select an option',
  hint,
  error,
  optional,
  value,
  defaultValue,
  disabled,
  onValueChange,
  className,
}: SelectFieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const rootProps = value === undefined ? { defaultValue, onValueChange } : { value, onValueChange };

  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <SelectPrimitive.Root disabled={disabled} {...rootProps}>
        <SelectPrimitive.Trigger
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(
            'flex min-h-11 w-full items-center justify-between gap-3 rounded-control border bg-surface px-3 py-2',
            'text-left text-base text-ink shadow-sm focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-50',
            'data-[placeholder]:text-muted/70 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted',
            error ? 'border-danger' : 'border-border',
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon asChild>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={6}
            className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-card border border-border bg-surface p-1 shadow-panel"
          >
            <SelectPrimitive.Viewport>
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={cn(
                    'relative flex min-h-10 cursor-default select-none items-center rounded-control py-2 pr-3 pl-9 text-sm text-ink outline-none',
                    'data-[highlighted]:bg-brand-50 data-[highlighted]:text-brand-800',
                    'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                  )}
                >
                  <span className="absolute left-3 inline-flex size-4 items-center justify-center">
                    <SelectPrimitive.ItemIndicator>
                      <Check aria-hidden="true" className="size-4" />
                    </SelectPrimitive.ItemIndicator>
                  </span>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </FieldFrame>
  );
}
