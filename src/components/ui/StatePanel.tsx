import { CheckCircle2, CircleAlert, Inbox, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/classnames';

type StateTone = 'empty' | 'loading' | 'success' | 'warning' | 'error';

export interface StatePanelProps {
  tone: StateTone;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

const stateConfig = {
  empty: { icon: Inbox, className: 'text-muted bg-canvas' },
  loading: { icon: LoaderCircle, className: 'text-brand-700 bg-brand-50' },
  success: { icon: CheckCircle2, className: 'text-confirmed bg-confirmed/10' },
  warning: { icon: TriangleAlert, className: 'text-stale bg-stale/10' },
  error: { icon: CircleAlert, className: 'text-danger bg-danger/10' },
} satisfies Record<StateTone, { icon: typeof Inbox; className: string }>;

export function StatePanel({ tone, title, description, action, className }: StatePanelProps) {
  const { icon: Icon, className: iconClassName } = stateConfig[tone];

  return (
    <section
      className={cn('grid justify-items-center rounded-card border border-border bg-surface px-5 py-8 text-center', className)}
      aria-live={tone === 'loading' ? 'polite' : undefined}
    >
      <span className={cn('inline-flex size-12 items-center justify-center rounded-pill', iconClassName)}>
        <Icon
          aria-hidden="true"
          className={cn('size-6', tone === 'loading' && 'animate-spin motion-reduce:animate-none')}
        />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}
