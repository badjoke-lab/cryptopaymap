import { describe, expect, it } from 'vitest';
import type { SubmissionContactProtector } from '../src/submissions/contact-protection';
import { createInMemorySubmissionPersistenceBackend } from '../src/submissions/in-memory-persistence';
import { createPhotoPrivateIntakeService } from '../src/submissions/photo-intake-service';
import { createHmacSubmissionStatusSecretProvider } from '../src/submissions/status-secret-provider';

const requestId = '20000000-0000-4000-8000-000000000001';
const uploadId = '30000000-0000-4000-8000-000000000001';
const receivedAt = new Date('2026-07-15T12:00:00.000Z');

function rawIntake(note: string | null = null) {
  return {
    schemaVersion: 'submission-common-v1',
    submissionType: 'photos',
    targetType: 'location',
    targetId: '40000000-0000-4000-8000-000000000001',
    relationship: 'customer',
    contact: { email: 'private@example.test', contactAllowed: true },
    evidenceLinks: [],
    originalPayload: {
      schemaVersion: 'photo-media-v1',
      media: [
        {
          quarantineUploadId: uploadId,
          purpose: 'public_gallery_candidate',
          role: 'gallery',
          declaredMimeType: 'image/jpeg',
          declaredByteSize: 125_000,
          capturedAt: '2026-07-10',
          description: 'Storefront entrance.',
          suggestedAltText: 'Entrance of the listed shop.',
          photographerPresent: true,
          rights: {
            rightsStatus: 'submitted_with_permission',
            rightsHolderPresent: true,
            permissionReferencePresent: false,
            licenseName: null,
            licenseUrl: null,
            publicDisplayPermission: true,
          },
        },
      ],
      submitterNote: note,
    },
    acknowledgements: { privacyNoticeAccepted: true, submissionTermsAccepted: true },
  };
}

const contactProtector: SubmissionContactProtector = {
  async protectEmail() {
    return {
      encryptedEmail: 'encrypted-contact-envelope',
      emailHash: 'a'.repeat(64),
      retentionUntil: new Date('2026-10-15T12:00:00.000Z'),
    };
  },
};

function fixture() {
  const persistence = createInMemorySubmissionPersistenceBackend();
  persistence.seedQuarantineReservation({
    id: uploadId,
    intakeRequestId: requestId,
    purpose: 'public_gallery_candidate',
    expiresAt: new Date('2026-07-15T13:00:00.000Z'),
  });
  let sequence = 0;
  return {
    persistence,
    intake: createPhotoPrivateIntakeService({
      persistence,
      statusSecrets: createHmacSubmissionStatusSecretProvider(new Uint8Array(32).fill(9)),
      contactProtector,
      generateSubmissionId: () =>
        `10000000-0000-4000-8000-${(++sequence).toString().padStart(12, '0')}`,
    }),
  };
}

describe('P5-05B private Photos intake', () => {
  it('atomically persists private payloads and consumes its reservation', async () => {
    const { intake, persistence } = fixture();
    const result = await intake.submit(requestId, rawIntake(), receivedAt);

    expect(result.state).toBe('committed');
    expect(persistence.snapshot()).toHaveLength(1);
    expect(persistence.reservationSnapshot()[0]).toMatchObject({
      consumedBySubmissionId: persistence.snapshot()[0]?.submissionId,
      consumedAt: receivedAt,
    });
    const privateState = JSON.stringify(persistence.snapshot());
    expect(privateState).toContain('encrypted-contact-envelope');
    expect(privateState).not.toContain('private@example.test');
    expect(privateState).not.toContain(result.statusSecret);
    expect(privateState).not.toContain('storageKey');
  });

  it('replays identically and rejects changed content without mutation', async () => {
    const { intake, persistence } = fixture();
    const first = await intake.submit(requestId, rawIntake(), receivedAt);
    await expect(intake.submit(requestId, rawIntake(), receivedAt)).resolves.toEqual({
      ...first,
      state: 'replayed',
    });
    await expect(intake.submit(requestId, rawIntake('Changed.'), receivedAt)).rejects.toMatchObject(
      { code: 'idempotency_conflict' },
    );
    expect(persistence.snapshot()).toHaveLength(1);
  });

  it.each([
    ['expired', { expiresAt: receivedAt }],
    ['wrong owner', { intakeRequestId: '20000000-0000-4000-8000-000000000099' }],
    ['wrong purpose', { purpose: 'evidence_image' as const }],
    [
      'already consumed',
      {
        consumedBySubmissionId: '10000000-0000-4000-8000-000000000099',
        consumedAt: new Date('2026-07-15T11:00:00.000Z'),
      },
    ],
  ])('rolls back all private records for a %s reservation', async (_label, override) => {
    const { intake, persistence } = fixture();
    persistence.seedQuarantineReservation({
      id: uploadId,
      intakeRequestId: requestId,
      purpose: 'public_gallery_candidate',
      expiresAt: new Date('2026-07-15T13:00:00.000Z'),
      ...override,
    });
    await expect(intake.submit(requestId, rawIntake(), receivedAt)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect(persistence.snapshot()).toHaveLength(0);
  });

  it('permits only one request identity to consume the same reservation', async () => {
    const { intake, persistence } = fixture();
    const competing = createPhotoPrivateIntakeService({
      persistence,
      statusSecrets: createHmacSubmissionStatusSecretProvider(new Uint8Array(32).fill(9)),
      contactProtector,
    });
    const outcomes = await Promise.allSettled([
      intake.submit(requestId, rawIntake(), receivedAt),
      competing.submit('20000000-0000-4000-8000-000000000002', rawIntake(), receivedAt),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(persistence.snapshot()).toHaveLength(1);
  });
});
