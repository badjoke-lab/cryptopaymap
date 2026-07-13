import {
  businessClaimSubmissionIntakeSchema,
  normalizeParsedBusinessClaimSubmissionIntake,
} from './business-claim-contract';
import { commonSubmissionIntakeSchema } from './contract';
import {
  createSubmissionPrivateIntakeService,
  type SubmissionPrivateIntakeDependencies,
  type SubmissionPrivateIntakeService,
} from './intake-service';

export type BusinessClaimPrivateIntakeDependencies = Omit<
  SubmissionPrivateIntakeDependencies,
  'intakeParser'
>;

export function createBusinessClaimPrivateIntakeService(
  dependencies: BusinessClaimPrivateIntakeDependencies,
): SubmissionPrivateIntakeService {
  return createSubmissionPrivateIntakeService({
    ...dependencies,
    intakeParser: {
      parse(rawInput) {
        const claimIntake = businessClaimSubmissionIntakeSchema.parse(rawInput);
        const originalIntake = commonSubmissionIntakeSchema.parse(rawInput);
        const normalized = normalizeParsedBusinessClaimSubmissionIntake(claimIntake);
        return {
          intake: originalIntake,
          normalizedPayload: structuredClone(normalized) as unknown as Record<string, unknown>,
        };
      },
    },
  });
}
