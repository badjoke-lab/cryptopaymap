import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../../lib/classnames';

export interface ModalDialogProps {
  trigger: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ModalDialog({
  trigger,
  title,
  description,
  children,
  footer,
  className,
  open,
  defaultOpen,
  onOpenChange,
}: ModalDialogProps) {
  const rootProps = open === undefined ? { defaultOpen, onOpenChange } : { open, onOpenChange };

  return (
    <DialogPrimitive.Root {...rootProps}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/45 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 max-h-[min(85svh,48rem)] w-[min(calc(100%-2rem),36rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto',
            'rounded-card border border-border bg-surface shadow-panel focus:outline-none',
            className,
          )}
        >
          <header className="border-b border-border px-5 py-5 pr-14 sm:px-6 sm:py-6 sm:pr-16">
            <DialogPrimitive.Title className="m-0 text-xl font-semibold tracking-tight text-ink">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted">
              {description}
            </DialogPrimitive.Description>
          </header>

          <div className="px-5 py-5 sm:px-6 sm:py-6">{children}</div>

          {footer ? <footer className="border-t border-border bg-canvas px-5 py-4 sm:px-6">{footer}</footer> : null}

          <DialogPrimitive.Close asChild>
            <button
              type="button"
              className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-control text-muted hover:bg-canvas hover:text-ink"
              aria-label="Close dialog"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
