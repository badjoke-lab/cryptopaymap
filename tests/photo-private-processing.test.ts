import { describe, expect, it } from 'vitest';
import { createInMemoryPrivatePhotoDerivativeStore } from '../src/submissions/in-memory-private-photo-derivatives';
import {
  createPhotoPrivateProcessingService,
  PhotoPrivateProcessingError,
  type PhotoMediaHandoffCommitCommand,
  type PhotoMediaHandoffEventPayload,
  type PhotoMediaHandoffPersistence,
  type PhotoPrivateProcessingRequest,
  type PhotoPrivateProcessor,
  type PhotoProcessedDerivative,
  type PhotoProcessingSubmissionContext,
} from '../src/submissions/photo-private-processing';
import { photoQuarantineObjectKey } from '../src/submissions/photo-upload-authorization';

type Bytes = Uint8Array<ArrayBuffer>;

const submissionId = '10000000-0000-4000-8000-000000000001';
const intakeRequestId = '20000000-0000-4000-8000-000000000001';
const processingRequestId = '30000000-0000-4000-8000-000000000001';
const targetId = '40000000-0000-4000-8000-000000000001';
const reservationId = '50000000-0000-4000-8000-000000000001';
const validatedAt = '2026-07-15T00:00:00.000Z';
const consumedAt = '2026-07-15T00:05:00.000Z';
const processedAt = new Date('2026-07-15T00:06:00.000Z');

function uint32Be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function uint32Le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: number[]): number[] {
  const typeBytes = ascii(type);
  return [
    ...uint32Be(data.length),
    ...typeBytes,
    ...data,
    ...uint32Be(crc32(Uint8Array.from([...typeBytes, ...data]))),
  ];
}

function png(width: number, height: number): Bytes {
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...pngChunk('IHDR', [...uint32Be(width), ...uint32Be(height), 8, 2, 0, 0, 0]),
    ...pngChunk('IDAT', [0]),
    ...pngChunk('IEND', []),
  ]);
}

function webp(width: number, height: number, animated = false): Bytes {
  const payload = [
    animated ? 0x02 : 0x00,
    0,
    0,
    0,
    ...uint32Le(width - 1).slice(0, 3),
    ...uint32Le(height - 1).slice(0, 3),
  ];
  const body = [...ascii('VP8X'), ...uint32Le(payload.length), ...payload];
  return Uint8Array.from([
    ...ascii('RIFF'),
    ...uint32Le(4 + body.length),
    ...ascii('WEBP'),
    ...body,
  ]);
}

async function hash(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

class MemoryPersistence implements PhotoMediaHandoffPersistence {
  readonly events = new Map<string, PhotoMediaHandoffEventPayload>();
  readonly commits: PhotoMediaHandoffCommitCommand[] = [];
  failCommit = false;

  constructor(public context: PhotoProcessingSubmissionContext | null) {}

  async loadSubmissionContext() {
    return this.context === null ? null : structuredClone(this.context);
  }

  async readHandoffEvent(eventId: string) {
    const event = this.events.get(eventId);
    return event === undefined ? null : structuredClone(event);
  }

  async commitHandoff(command: PhotoMediaHandoffCommitCommand) {
    if (this.failCommit) throw new Error('commit failed');
    if (this.events.size > 0 || this.events.has(command.eventId)) {
      throw new Error('Submission already has a Media handoff');
    }
    if (
      this.context === null ||
      command.submissionId !== this.context.id ||
      command.expectedSubmissionUpdatedAt.toISOString() !== this.context.updatedAt ||
      command.expectedWorkflowStatus !== this.context.workflowStatus
    ) {
      throw new Error('stale submission');
    }
    this.commits.push(structuredClone(command));
    this.events.set(command.eventId, structuredClone(command.eventPayload));
  }
}

function processor(): PhotoPrivateProcessor & { calls: number } {
  const result: PhotoPrivateProcessor & { calls: number } = {
    calls: 0,
    async process(): Promise<PhotoProcessedDerivative[]> {
      result.calls += 1;
      return [
        {
          variant: 'display',
          body: webp(800, 600),
          mimeType: 'image/webp',
          width: 800,
          height: 600,
          metadataStripped: true,
          orientationNormalized: true,
        },
        {
          variant: 'thumbnail',
          body: webp(160, 120),
          mimeType: 'image/webp',
          width: 160,
          height: 120,
          metadataStripped: true,
          orientationNormalized: true,
        },
      ];
    },
  };
  return result;
}

async function fixture() {
  const body = png(1_000, 800);
  const contentHash = await hash(body);
  const context: PhotoProcessingSubmissionContext = {
    id: submissionId,
    intakeRequestId,
    submissionType: 'photos',
    targetType: 'location',
    targetId,
    workflowStatus: 'received',
    updatedAt: consumedAt,
    normalizedPayload: {
      targetType: 'location',
      targetId,
      relationship: 'customer',
      media: [
        {
          quarantineUploadId: reservationId,
          purpose: 'public_gallery_candidate',
          role: 'cover',
          declaredMimeType: 'image/png',
          declaredByteSize: body.byteLength,
          capturedAt: '2026-07-14',
          description: 'Storefront exterior.',
          suggestedAltText: 'Exterior of the storefront.',
          photographerPresent: true,
          rightsStatus: 'submitted_with_permission',
          rightsHolderPresent: true,
          permissionReferencePresent: false,
          licenseName: null,
          licenseUrl: null,
          publicDisplayPermission: true,
        },
      ],
      submitterNote: null,
    },
    reservations: [
      {
        id: reservationId,
        intakeRequestId,
        purpose: 'public_gallery_candidate',
        expiresAt: '2026-07-15T00:10:00.000Z',
        consumedBySubmissionId: submissionId,
        consumedAt,
      },
    ],
  };
  const request: PhotoPrivateProcessingRequest = {
    schemaVersion: 'photo-private-processing-v1',
    processingRequestId,
    submissionId,
    processorVersion: 'test-codec/1.0.0',
    validation: {
      receipt: {
        schemaVersion: 'photo-object-validation-receipt-v1',
        intakeRequestId,
        targetType: 'location',
        targetId,
        validatedAt,
        media: [
          {
            quarantineUploadId: reservationId,
            mimeType: 'image/png',
            byteSize: body.byteLength,
            width: 1_000,
            height: 800,
            contentHash,
          },
        ],
      },
      objects: [
        {
          quarantineUploadId: reservationId,
          privateObjectKey: photoQuarantineObjectKey(reservationId),
          body,
          mimeType: 'image/png',
          byteSize: body.byteLength,
          width: 1_000,
          height: 800,
          contentHash,
        },
      ],
    },
  };
  return { contentHash, context, request };
}

function leakText(value: unknown): string {
  return JSON.stringify(value);
}

describe('P5-05E private photo processing and Media handoff', () => {
  it('creates private pending Media with quarantine original and two safe derivatives', async () => {
    const { context, request, contentHash } = await fixture();
    const persistence = new MemoryPersistence(context);
    const derivatives = createInMemoryPrivatePhotoDerivativeStore();
    const privateProcessor = processor();
    const service = createPhotoPrivateProcessingService({
      persistence,
      derivatives,
      processor: privateProcessor,
    });

    const receipt = await service.process(request, processedAt);

    expect(receipt.state).toBe('committed');
    expect(privateProcessor.calls).toBe(1);
    expect(persistence.commits).toHaveLength(1);
    expect(persistence.commits[0]?.assets).toEqual([
      expect.objectContaining({
        purpose: 'public_gallery_candidate',
        role: 'cover',
        reviewStatus: 'pending',
        rightsStatus: 'unknown',
        visibility: 'private',
        entityId: null,
        locationId: targetId,
      }),
    ]);
    expect(persistence.commits[0]?.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          variant: 'original',
          storageScope: 'quarantine',
          storageKey: photoQuarantineObjectKey(reservationId),
          contentHash,
        }),
        expect.objectContaining({ variant: 'display', storageScope: 'private' }),
        expect.objectContaining({ variant: 'thumbnail', storageScope: 'private' }),
      ]),
    );
    expect(derivatives.snapshot()).toHaveLength(2);
    expect(leakText(receipt)).not.toContain('storageKey');
    expect(leakText(receipt)).not.toContain('privateObjectKey');
    expect(leakText(receipt)).not.toContain('body');
  });

  it('replays without reprocessing even if the Submission version later changes', async () => {
    const { context, request } = await fixture();
    const persistence = new MemoryPersistence(context);
    const derivatives = createInMemoryPrivatePhotoDerivativeStore();
    const privateProcessor = processor();
    const service = createPhotoPrivateProcessingService({
      persistence,
      derivatives,
      processor: privateProcessor,
    });

    const committed = await service.process(request, processedAt);
    persistence.context = {
      ...context,
      workflowStatus: 'triage',
      updatedAt: '2026-07-15T01:00:00.000Z',
    };
    const replayed = await service.process(request, new Date('2026-07-15T02:00:00.000Z'));

    expect(committed.state).toBe('committed');
    expect(replayed).toEqual({ ...committed, state: 'replayed' });
    expect(privateProcessor.calls).toBe(1);
    expect(persistence.commits).toHaveLength(1);
    expect(derivatives.snapshot()).toHaveLength(2);
  });

  it('rejects changed content under the same processing request identity', async () => {
    const { context, request } = await fixture();
    const persistence = new MemoryPersistence(context);
    const service = createPhotoPrivateProcessingService({
      persistence,
      derivatives: createInMemoryPrivatePhotoDerivativeStore(),
      processor: processor(),
    });
    await service.process(request, processedAt);

    await expect(
      service.process({ ...request, processorVersion: 'test-codec/2.0.0' }, processedAt),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

  it('re-hashes the exact validated bytes before invoking the processor', async () => {
    const { context, request } = await fixture();
    const changed = structuredClone(request);
    const changedObject = changed.validation.objects[0];
    if (changedObject === undefined) throw new Error('fixture object is missing');
    const changedBody = Uint8Array.from(changedObject.body);
    changedBody[0] = (changedBody[0] ?? 0) ^ 0xff;
    changedObject.body = changedBody;
    const privateProcessor = processor();
    const service = createPhotoPrivateProcessingService({
      persistence: new MemoryPersistence(context),
      derivatives: createInMemoryPrivatePhotoDerivativeStore(),
      processor: privateProcessor,
    });

    await expect(service.process(changed, processedAt)).rejects.toMatchObject({
      code: 'validation_conflict',
    });
    expect(privateProcessor.calls).toBe(0);
  });

  it('requires reservations consumed by the exact Photos Submission after validation', async () => {
    const { context, request } = await fixture();
    context.reservations[0]!.consumedBySubmissionId = '10000000-0000-4000-8000-000000000099';
    const service = createPhotoPrivateProcessingService({
      persistence: new MemoryPersistence(context),
      derivatives: createInMemoryPrivatePhotoDerivativeStore(),
      processor: processor(),
    });

    await expect(service.process(request, processedAt)).rejects.toMatchObject({
      code: 'validation_conflict',
    });
  });

  it('rejects animated, mismatched, unstripped, or oversized derivatives', async () => {
    const { context, request } = await fixture();
    const cases: PhotoPrivateProcessor[] = [
      {
        async process(): Promise<PhotoProcessedDerivative[]> {
          return [
            {
              variant: 'display',
              body: webp(800, 600, true),
              mimeType: 'image/webp',
              width: 800,
              height: 600,
              metadataStripped: true,
              orientationNormalized: true,
            },
            {
              variant: 'thumbnail',
              body: webp(160, 120),
              mimeType: 'image/webp',
              width: 160,
              height: 120,
              metadataStripped: true,
              orientationNormalized: true,
            },
          ];
        },
      },
      {
        async process(): Promise<PhotoProcessedDerivative[]> {
          return [
            {
              variant: 'display',
              body: webp(800, 600),
              mimeType: 'image/webp',
              width: 801,
              height: 600,
              metadataStripped: true,
              orientationNormalized: true,
            },
            {
              variant: 'thumbnail',
              body: webp(160, 120),
              mimeType: 'image/webp',
              width: 160,
              height: 120,
              metadataStripped: true,
              orientationNormalized: true,
            },
          ];
        },
      },
      {
        async process(): Promise<PhotoProcessedDerivative[]> {
          return [
            {
              variant: 'display',
              body: webp(800, 600),
              mimeType: 'image/webp',
              width: 800,
              height: 600,
              metadataStripped: false as true,
              orientationNormalized: true,
            },
            {
              variant: 'thumbnail',
              body: webp(160, 120),
              mimeType: 'image/webp',
              width: 160,
              height: 120,
              metadataStripped: true,
              orientationNormalized: true,
            },
          ];
        },
      },
      {
        async process(): Promise<PhotoProcessedDerivative[]> {
          return [
            {
              variant: 'display',
              body: webp(2_049, 100),
              mimeType: 'image/webp',
              width: 2_049,
              height: 100,
              metadataStripped: true,
              orientationNormalized: true,
            },
            {
              variant: 'thumbnail',
              body: webp(160, 120),
              mimeType: 'image/webp',
              width: 160,
              height: 120,
              metadataStripped: true,
              orientationNormalized: true,
            },
          ];
        },
      },
    ];

    for (const privateProcessor of cases) {
      const derivatives = createInMemoryPrivatePhotoDerivativeStore();
      const service = createPhotoPrivateProcessingService({
        persistence: new MemoryPersistence(context),
        derivatives,
        processor: privateProcessor,
      });
      await expect(service.process(request, processedAt)).rejects.toBeInstanceOf(
        PhotoPrivateProcessingError,
      );
      expect(derivatives.snapshot()).toHaveLength(0);
    }
  });

  it('removes newly staged derivatives when the atomic database handoff fails', async () => {
    const { context, request } = await fixture();
    const persistence = new MemoryPersistence(context);
    persistence.failCommit = true;
    const derivatives = createInMemoryPrivatePhotoDerivativeStore();
    const service = createPhotoPrivateProcessingService({
      persistence,
      derivatives,
      processor: processor(),
    });

    await expect(service.process(request, processedAt)).rejects.toMatchObject({
      code: 'persistence_conflict',
    });
    expect(derivatives.snapshot()).toHaveLength(0);
    expect(persistence.commits).toHaveLength(0);
  });

  it('prevents a second processing identity from creating duplicate Media', async () => {
    const { context, request } = await fixture();
    const persistence = new MemoryPersistence(context);
    const derivatives = createInMemoryPrivatePhotoDerivativeStore();
    const privateProcessor = processor();
    const service = createPhotoPrivateProcessingService({
      persistence,
      derivatives,
      processor: privateProcessor,
    });
    await service.process(request, processedAt);

    await expect(
      service.process(
        {
          ...request,
          processingRequestId: '30000000-0000-4000-8000-000000000002',
        },
        new Date('2026-07-15T00:07:00.000Z'),
      ),
    ).rejects.toMatchObject({ code: 'persistence_conflict' });
    expect(persistence.commits).toHaveLength(1);
    expect(derivatives.snapshot()).toHaveLength(2);
  });

  it('fails closed when the Photos Submission is absent or malformed', async () => {
    const { context, request } = await fixture();
    const missing = createPhotoPrivateProcessingService({
      persistence: new MemoryPersistence(null),
      derivatives: createInMemoryPrivatePhotoDerivativeStore(),
      processor: processor(),
    });
    await expect(missing.process(request, processedAt)).rejects.toMatchObject({
      code: 'submission_unavailable',
    });

    const malformedContext: PhotoProcessingSubmissionContext = {
      ...context,
      normalizedPayload: null,
    };
    const malformed = createPhotoPrivateProcessingService({
      persistence: new MemoryPersistence(malformedContext),
      derivatives: createInMemoryPrivatePhotoDerivativeStore(),
      processor: processor(),
    });
    await expect(malformed.process(request, processedAt)).rejects.toMatchObject({
      code: 'submission_unavailable',
    });
  });
});
