import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { Toast as ToastPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../../lib/classnames';

type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastProviderProps {
  children: ReactNode;
  duration?: number;
}

export interface ToastNoticeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  tone?: ToastTone;
  actionLabel?: string;
  actionAltText?: string;
  onAction?: () => void;
}

const toneConfig = {
  info: { icon: Info, className: 'text-brand-700' },
  success: { icon: CheckCircle2, className: 'text-confirmed' },
  warning: { icon: TriangleAlert, className: 'text-stale' },
  error: { icon: XCircle, className: 'text-danger' },
} satisfies Record<ToastTone, { icon: typeof Info; className: string }>;

export function ToastProvider({ children, duration = 5000 }: ToastProviderProps) {
  return (
    <ToastPrimitive.Provider duration={duration} swipeDirection="right">
      {children}
      <ToastPrimitive.Viewport className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-[70] grid w-[min(calc(100%-2rem),24rem)] gap-3 outline-none" />
    </ToastPrimitive.Provider>
  );
}

export function ToastNotice({
  open,
  onOpenChange,
  title,
  description,
  tone = 'info',
  actionLabel,
  actionAltText,
  onAction,
}: ToastNoticeProps) {
  const { icon: Icon, className: iconClassName } = toneConfig[tone];
  const hasAction = Boolean(actionLabel && actionAltText && onAction);

  return (
    <ToastPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      className="cpm-toast grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-card border border-border bg-surface p-4 shadow-panel"
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-5', iconClassName)} />
      <div className="min-w-0">
        <ToastPrimitive.Title className="text-sm font-semibold text-ink">
          {title}
        </ToastPrimitive.Title>
        {description ? (
          <ToastPrimitive.Description className="mt-1 text-sm leading-5 text-muted">
            {description}
          </ToastPrimitive.Description>
        ) : null}
        {hasAction ? (
          <ToastPrimitive.Action asChild altText={actionAltText as string}>
            <button
              type="button"
              onClick={onAction}
              className="motion-feedback mt-3 min-h-10 rounded-control bg-brand-50 px-3 text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-50/70"
            >
              {actionLabel}
            </button>
          </ToastPrimitive.Action>
        ) : null}
      </div>
      <ToastPrimitive.Close asChild>
        <button
          type="button"
          className="motion-feedback inline-flex size-10 items-center justify-center rounded-control text-muted transition-colors hover:bg-canvas hover:text-ink"
          aria-label="Dismiss notification"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}
