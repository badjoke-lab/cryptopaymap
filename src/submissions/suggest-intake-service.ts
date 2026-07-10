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
        const intake = suggestSubmissionIntakeSchema.parse(rawInput);
        const normalized = normalizeParsedSuggestSubmissionIntake(intake);
        return {
          intake,
          normalizedPayload: structuredClone(normalized) as unknown as Record<string, unknown>,
        };
      },
    },
  });
}
