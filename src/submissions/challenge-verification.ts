export type SubmissionChallengeOutcome = 'allow' | 'deny' | 'unavailable';

export interface SubmissionChallengeVerificationRequest {
  requestId: string;
  token: string;
  remoteIp: string | null;
}

export interface SubmissionChallengeVerificationDecision {
  outcome: SubmissionChallengeOutcome;
  reasonCode: string;
}

export interface SubmissionChallengeVerifier {
  verify(
    request: SubmissionChallengeVerificationRequest,
  ): Promise<SubmissionChallengeVerificationDecision>;
}
