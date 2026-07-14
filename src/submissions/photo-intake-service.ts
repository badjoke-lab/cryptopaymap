import { commonSubmissionIntakeSchema } from './contract';
import {
  createSubmissionPrivateIntakeService,
  type SubmissionPrivateIntakeDependencies,
  type SubmissionPrivateIntakeService,
} from './intake-service';
import {
  normalizeParsedPhotosSubmissionIntake,
  photosSubmissionIntakeSchema,
} from './photo-media-contract';

export type PhotoPrivateIntakeDependencies = Omit<
  SubmissionPrivateIntakeDependencies,
  'intakeParser'
>;

export function createPhotoPrivateIntakeService(
  dependencies: PhotoPrivateIntakeDependencies,
): SubmissionPrivateIntakeService {
  return createSubmissionPrivateIntakeService({
    ...dependencies,
    intakeParser: {
      parse(rawInput) {
        const photoIntake = photosSubmissionIntakeSchema.parse(rawInput);
        const originalIntake = commonSubmissionIntakeSchema.parse(rawInput);
        const normalized = normalizeParsedPhotosSubmissionIntake(photoIntake);
        return {
          intake: originalIntake,
          normalizedPayload: structuredClone(normalized) as unknown as Record<string, unknown>,
          quarantineUploadIds: photoIntake.originalPayload.media.map(
            (item) => item.quarantineUploadId,
          ),
        };
      },
    },
  });
}
