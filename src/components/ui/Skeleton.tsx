import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/classnames';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-control bg-border/65 motion-reduce:animate-none', className)}
      {...props}
    />
  );
}
