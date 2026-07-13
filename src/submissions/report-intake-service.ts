import { commonSubmissionIntakeSchema } from './contract';
import {
  createSubmissionPrivateIntakeService,
  type SubmissionPrivateIntakeDependencies,
  type SubmissionPrivateIntakeService,
} from './intake-service';
import {
  normalizeParsedPaymentReportSubmissionIntake,
  normalizeParsedProblemReportSubmissionIntake,
  reportSubmissionIntakeSchema,
} from './report-contract';

export type ReportSubmissionPrivateIntakeDependencies = Omit<
  SubmissionPrivateIntakeDependencies,
  'intakeParser'
>;

export function createReportSubmissionPrivateIntakeService(
  dependencies: ReportSubmissionPrivateIntakeDependencies,
): SubmissionPrivateIntakeService {
  return createSubmissionPrivateIntakeService({
    ...dependencies,
    intakeParser: {
      parse(rawInput) {
        const reportIntake = reportSubmissionIntakeSchema.parse(rawInput);
        const originalIntake = commonSubmissionIntakeSchema.parse(rawInput);
        const normalized =
          reportIntake.submissionType === 'payment_report'
            ? normalizeParsedPaymentReportSubmissionIntake(reportIntake)
            : normalizeParsedProblemReportSubmissionIntake(reportIntake);
        return {
          intake: originalIntake,
          normalizedPayload: structuredClone(normalized) as unknown as Record<string, unknown>,
        };
      },
    },
  });
}
