import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { motionTransition } from '../../motion/tokens';

export interface AnimatedSwapProps {
  motionKey: string;
  children: ReactNode;
  className?: string;
}

export function AnimatedSwap({ motionKey, children, className }: AnimatedSwapProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={motionKey}
        className={className}
        initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
        transition={motionTransition.feedback}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
