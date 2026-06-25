import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../../lib/classnames';

type SheetSide = 'bottom' | 'right';

export interface SheetProps {
  trigger: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  side?: SheetSide;
  className?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const sideClasses: Record<SheetSide, string> = {
  bottom:
    'inset-x-0 bottom-0 max-h-[85svh] rounded-t-card border-x border-t pb-[env(safe-area-inset-bottom)]',
  right:
    'inset-y-0 right-0 h-full w-[min(100%,28rem)] border-l pb-[env(safe-area-inset-bottom)]',
};

export function Sheet({
  trigger,
  title,
  description,
  children,
  footer,
  side = 'bottom',
  className,
  open,
  defaultOpen,
  onOpenChange,
}: SheetProps) {
  const rootProps = {
    ...(open !== undefined ? { open } : {}),
    ...(open === undefined && defaultOpen !== undefined ? { defaultOpen } : {}),
    ...(onOpenChange !== undefined ? { onOpenChange } : {}),
  };

  return (
    <DialogPrimitive.Root {...rootProps}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/45 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden border-border bg-surface shadow-panel focus:outline-none',
            sideClasses[side],
            className,
          )}
        >
          <header className="shrink-0 border-b border-border px-5 py-5 pr-14 sm:px-6 sm:pr-16">
            {side === 'bottom' ? (
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-pill bg-border" aria-hidden="true" />
            ) : null}
            <DialogPrimitive.Title className="m-0 text-xl font-semibold tracking-tight text-ink">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted">
              {description}
            </DialogPrimitive.Description>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">{children}</div>

          {footer ? <footer className="shrink-0 border-t border-border bg-canvas px-5 py-4 sm:px-6">{footer}</footer> : null}

          <DialogPrimitive.Close asChild>
            <button
              type="button"
              className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-control text-muted hover:bg-canvas hover:text-ink"
              aria-label="Close sheet"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
