import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/classnames';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  as?: 'article' | 'section' | 'div';
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
}

export function Card({
  as: Component = 'article',
  eyebrow,
  title,
  description,
  footer,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <Component
      className={cn(
        'overflow-hidden rounded-card border border-border bg-surface shadow-sm',
        className,
      )}
      {...props}
    >
      {eyebrow || title || description ? (
        <header className="grid gap-1.5 px-5 pt-5 sm:px-6 sm:pt-6">
          {eyebrow ? <div className="text-sm font-semibold text-brand-700">{eyebrow}</div> : null}
          {title ? (
            <h3 className="m-0 text-xl font-semibold tracking-tight text-ink">{title}</h3>
          ) : null}
          {description ? <div className="text-sm leading-6 text-muted">{description}</div> : null}
        </header>
      ) : null}

      {children ? <div className="px-5 py-5 sm:px-6 sm:py-6">{children}</div> : null}

      {footer ? (
        <footer className="border-t border-border bg-canvas px-5 py-4 sm:px-6">{footer}</footer>
      ) : null}
    </Component>
  );
}
