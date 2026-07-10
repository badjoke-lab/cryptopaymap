import { commonSubmissionIntakeSchema } from './contract';
import {
  createSubmissionPrivateIntakeService,
  type SubmissionPrivateIntakeDependencies,
  type SubmissionPrivateIntakeService,
} from './intake-service';
import {
  normalizeParsedSuggestSubmissionIntake,
  suggestSubmissionIntakeSchema,
} from './suggest-contract';

export type SuggestSubmissionPrivateIntakeDependencies = Omit<
  SubmissionPrivateIntakeDependencies,
  'intakeParser'
>;

export function createSuggestSubmissionPrivateIntakeService(
  dependencies: SuggestSubmissionPrivateIntakeDependencies,
): SubmissionPrivateIntakeService {
  return createSubmissionPrivateIntakeService({
    ...dependencies,
    intakeParser: {
      parse(rawInput) {
        const suggestIntake = suggestSubmissionIntakeSchema.parse(rawInput);
        const originalIntake = commonSubmissionIntakeSchema.parse(rawInput);
        const normalized = normalizeParsedSuggestSubmissionIntake(suggestIntake);
        return {
          intake: originalIntake,
          normalizedPayload: structuredClone(normalized) as unknown as Record<string, unknown>,
        };
      },
    },
  });
}
