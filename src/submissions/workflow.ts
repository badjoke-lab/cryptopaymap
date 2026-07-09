import type { SubmissionResolution, SubmissionWorkflowStatus } from './contract';

export class SubmissionWorkflowError extends Error {
  constructor(
    readonly code: 'transition_not_allowed' | 'resolution_invalid',
    message: string,
  ) {
    super(message);
    this.name = 'SubmissionWorkflowError';
  }
}

const allowedTransitions: Record<SubmissionWorkflowStatus, readonly SubmissionWorkflowStatus[]> = {
  received: ['triage', 'duplicate', 'rejected_spam', 'withdrawn'],
  triage: ['in_review', 'duplicate', 'rejected_spam', 'withdrawn'],
  in_review: ['needs_information', 'on_hold', 'resolved', 'duplicate', 'withdrawn'],
  needs_information: ['in_review', 'on_hold', 'resolved', 'withdrawn'],
  on_hold: ['in_review', 'needs_information', 'resolved', 'withdrawn'],
  resolved: [],
  duplicate: [],
  rejected_spam: [],
  withdrawn: [],
};

export interface SubmissionWorkflowTransition {
  fromStatus: SubmissionWorkflowStatus;
  toStatus: SubmissionWorkflowStatus;
  resolution: SubmissionResolution | null;
}

export function assertSubmissionWorkflowTransition(transition: SubmissionWorkflowTransition): void {
  if (!allowedTransitions[transition.fromStatus].includes(transition.toStatus)) {
    throw new SubmissionWorkflowError(
      'transition_not_allowed',
      `Submission transition ${transition.fromStatus} -> ${transition.toStatus} is not allowed.`,
    );
  }

  if (transition.toStatus === 'resolved' && transition.resolution === null) {
    throw new SubmissionWorkflowError(
      'resolution_invalid',
      'Resolved submissions require a resolution.',
    );
  }

  if (
    transition.toStatus === 'duplicate' &&
    transition.resolution !== null &&
    transition.resolution !== 'duplicate'
  ) {
    throw new SubmissionWorkflowError(
      'resolution_invalid',
      'Duplicate submissions may only use the duplicate resolution.',
    );
  }

  if (
    transition.toStatus === 'withdrawn' &&
    transition.resolution !== null &&
    transition.resolution !== 'withdrawn'
  ) {
    throw new SubmissionWorkflowError(
      'resolution_invalid',
      'Withdrawn submissions may only use the withdrawn resolution.',
    );
  }

  if (
    !['resolved', 'duplicate', 'withdrawn'].includes(transition.toStatus) &&
    transition.resolution !== null
  ) {
    throw new SubmissionWorkflowError(
      'resolution_invalid',
      'Non-terminal workflow transitions must not set a resolution.',
    );
  }
}

export function isSubmissionWorkflowTerminal(status: SubmissionWorkflowStatus): boolean {
  return allowedTransitions[status].length === 0;
}
