import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/classnames';

type BadgeTone = 'neutral' | 'brand' | 'confirmed' | 'stale' | 'ended' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: ReactNode;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-canvas text-muted ring-border',
  brand: 'bg-brand-50 text-brand-800 ring-brand-600/20',
  confirmed: 'bg-confirmed/10 text-confirmed ring-confirmed/20',
  stale: 'bg-stale/10 text-stale ring-stale/20',
  ended: 'bg-ended/10 text-ended ring-ended/20',
  danger: 'bg-danger/10 text-danger ring-danger/20',
};

export function Badge({ tone = 'neutral', icon, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {icon ? <span className="inline-flex size-3.5 items-center justify-center">{icon}</span> : null}
      {children}
    </span>
  );
}
