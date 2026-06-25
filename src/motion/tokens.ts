export const motionDuration = {
  instant: 0.08,
  fast: 0.14,
  normal: 0.22,
  slow: 0.32,
} as const;

export const motionEase = {
  standard: [0.2, 0, 0, 1],
  enter: [0, 0, 0, 1],
  exit: [0.4, 0, 1, 1],
} as const;

export const motionTransition = {
  feedback: {
    duration: motionDuration.fast,
    ease: motionEase.standard,
  },
  panel: {
    duration: motionDuration.normal,
    ease: motionEase.standard,
  },
  page: {
    duration: motionDuration.normal,
    ease: motionEase.standard,
  },
} as const;
