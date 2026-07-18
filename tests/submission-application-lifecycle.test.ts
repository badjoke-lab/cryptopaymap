import { describe, expect, it } from 'vitest';
import {
  readSubmissionApplicationLifecycle,
  submissionApplicationTransitionRequestSchema,
  transitionSubmissionApplicationLifecycle,
  type SubmissionApplicationLifecycleBackend,
  type SubmissionApplicationLifecycleRecord,
  type SubmissionApplicationTransitionCommand,
  type SubmissionApplicationTransitionReplayRecord,
} from '../src/admin/submissions/application-lifecycle';
import { SubmissionPersistenceError } from '../src/submissions/persistence';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const sourceDecisionEventId = '30000000-0000-4000-8000-000000000001';
const applicationReceiptId = '40000000-0000-4000-8000-000000000001';
const publicationReceiptId = '50000000-0000-4000-8000-000000000001';
const registeredEventId = '60000000-0000-4000-8000-000000000001';
const registeredAt = '2026-07-18T05:00:00.000Z';

const readContext = {
  actorId: 'reviewer:lifecycle-reader',
  actorType: 'human' as const,
  capabilities: ['submission:application:read'] as ['submission:application:read'],
};
const transitionContext = {
  actorId: 'reviewer:lifecycle-transitioner',
  actorType: 'human' as const,
  capabilities: ['submission:application:transition'] as ['submission:application:transition'],
};

function initialRecord(): SubmissionApplicationLifecycleRecord {
  return {
    applicationId,
    submissionId,
    submissionType: 'problem_report',
    sourceDecisionKind: 'problem_correction_handoff',
    sourceDecisionEventId,
    applicationKind: 'problem_correction',
    applicationStatus: 'pending',
    publicationStatus: 'blocked',
    applicationReceipt: null,
    publicationReceipt: null,
    registeredAt,
    updatedAt: registeredAt,
    events: [
      {
        eventId: registeredEventId,
        action: 'registered',
        fromApplicationStatus: null,
        toApplicationStatus: 'pending',
        fromPublicationStatus: null,
        toPublicationStatus: 'blocked',
        createdAt: registeredAt,
      },
    ],
  };
}

function request(
  requestId: string,
  operation:
    | 'commit_application'
    | 'fail_application'
    | 'retry_application'
    | 'commit_publication'
    | 'fail_publication'
    | 'retry_publication',
  expectedApplicationStatus: 'pending' | 'committed' | 'failed',
  expectedPublicationStatus: 'blocked' | 'pending' | 'committed' | 'failed',
  expectedUpdatedAt: string,
  receipt: { kind: 'submission_event' | 'export_release_decision'; ids: string[] } | null,
) {
  return {
    schemaVersion: 'submission-application-transition-v1',
    requestId,
    operation,
    expectedApplicationStatus,
    expectedPublicationStatus,
    expectedUpdatedAt,
    receipt,
  };
}

function createBackend() {
  let record = initialRecord();
  const transitions = new Map<string, SubmissionApplicationTransitionReplayRecord>();
  const commits: SubmissionApplicationTransitionCommand[] = [];
  let failAfterCommit = false;
  let reads = 0;

  const backend: SubmissionApplicationLifecycleBackend & {
    commits: SubmissionApplicationTransitionCommand[];
    setFailAfterCommit(value: boolean): void;
    reads(): number;
  } = {
    commits,
    setFailAfterCommit(value) {
      failAfterCommit = value;
    },
    reads() {
      return reads;
    },
    async readApplication(id) {
      reads += 1;
      return id === applicationId ? structuredClone(record) : null;
    },
    async readTransition(id) {
      return structuredClone(transitions.get(id) ?? null);
    },
    async commitTransition(command) {
      commits.push(command);
      if (
        record.applicationStatus !== command.fromApplicationStatus ||
        record.publicationStatus !== command.fromPublicationStatus ||
        record.updatedAt !== command.expectedUpdatedAt.toISOString()
      ) {
        throw new SubmissionPersistenceError('conflict', 'synthetic stale state');
      }
      record = {
        ...record,
        applicationStatus: command.toApplicationStatus,
        publicationStatus: command.toPublicationStatus,
        applicationReceipt: command.nextApplicationReceipt,
        publicationReceipt: command.nextPublicationReceipt,
        updatedAt: command.changedAt.toISOString(),
        events: [
          ...record.events,
          {
            eventId: command.transitionEventId,
            action: command.action,
            fromApplicationStatus: command.fromApplicationStatus,
            toApplicationStatus: command.toApplicationStatus,
            fromPublicationStatus: command.fromPublicationStatus,
            toPublicationStatus: command.toPublicationStatus,
            createdAt: command.changedAt.toISOString(),
          },
        ],
      };
      transitions.set(command.transitionEventId, {
        transitionEventId: command.transitionEventId,
        applicationId: command.applicationId,
        action: command.action,
        fromApplicationStatus: command.fromApplicationStatus,
        toApplicationStatus: command.toApplicationStatus,
        fromPublicationStatus: command.fromPublicationStatus,
        toPublicationStatus: command.toPublicationStatus,
        actorId: command.actorId,
        requestFingerprint: command.requestFingerprint,
        changedAt: command.changedAt.toISOString(),
      });
      if (failAfterCommit) {
        throw new SubmissionPersistenceError('conflict', 'synthetic concurrent replay');
      }
    },
  };
  return backend;
}

describe('P5-07B2 application lifecycle', () => {
  it('reads a bounded projection without actor or fingerprint fields', async () => {
    const projection = await readSubmissionApplicationLifecycle(
      readContext,
      createBackend(),
      applicationId,
    );
    expect(projection).toMatchObject({
      applicationId,
      applicationStatus: 'pending',
      publicationStatus: 'blocked',
      events: [{ action: 'registered' }],
    });
    expect(JSON.stringify(projection)).not.toContain('reviewer:');
    expect(JSON.stringify(projection)).not.toContain('fingerprint');
  });

  it('commits application and publication through exact ordered transitions', async () => {
    const backend = createBackend();
    const applicationChangedAt = new Date('2026-07-18T05:01:00.000Z');
    const application = await transitionSubmissionApplicationLifecycle(
      transitionContext,
      backend,
      applicationId,
      request(
        '70000000-0000-4000-8000-000000000001',
        'commit_application',
        'pending',
        'blocked',
        registeredAt,
        { kind: 'submission_event', ids: [applicationReceiptId] },
      ),
      applicationChangedAt,
    );
    expect(application).toMatchObject({
      action: 'application_committed',
      fromApplicationStatus: 'pending',
      toApplicationStatus: 'committed',
      toPublicationStatus: 'pending',
    });

    const publicationChangedAt = new Date('2026-07-18T05:02:00.000Z');
    const publication = await transitionSubmissionApplicationLifecycle(
      transitionContext,
      backend,
      applicationId,
      request(
        '70000000-0000-4000-8000-000000000002',
        'commit_publication',
        'committed',
        'pending',
        applicationChangedAt.toISOString(),
        { kind: 'export_release_decision', ids: [publicationReceiptId] },
      ),
      publicationChangedAt,
    );
    expect(publication).toMatchObject({
      action: 'publication_committed',
      toApplicationStatus: 'committed',
      toPublicationStatus: 'committed',
    });

    const projection = await readSubmissionApplicationLifecycle(readContext, backend, applicationId);
    expect(projection.applicationReceipt).toEqual({
      kind: 'submission_event',
      ids: [applicationReceiptId],
    });
    expect(projection.publicationReceipt).toEqual({
      kind: 'export_release_decision',
      ids: [publicationReceiptId],
    });
    expect(projection.events.map((event) => event.action)).toEqual([
      'registered',
      'application_committed',
      'publication_committed',
    ]);
  });

  it('supports explicit application and publication failure/retry paths', async () => {
    const backend = createBackend();
    const failedAt = new Date('2026-07-18T05:01:00.000Z');
    await transitionSubmissionApplicationLifecycle(
      transitionContext,
      backend,
      applicationId,
      request(
        '71000000-0000-4000-8000-000000000001',
        'fail_application',
        'pending',
        'blocked',
        registeredAt,
        null,
      ),
      failedAt,
    );
    const retriedAt = new Date('2026-07-18T05:02:00.000Z');
    await expect(
      transitionSubmissionApplicationLifecycle(
        transitionContext,
        backend,
        applicationId,
        request(
          '71000000-0000-4000-8000-000000000002',
          'retry_application',
          'failed',
          'blocked',
          failedAt.toISOString(),
          null,
        ),
        retriedAt,
      ),
    ).resolves.toMatchObject({ action: 'application_retried', toApplicationStatus: 'pending' });

    const committedAt = new Date('2026-07-18T05:03:00.000Z');
    await transitionSubmissionApplicationLifecycle(
      transitionContext,
      backend,
      applicationId,
      request(
        '71000000-0000-4000-8000-000000000003',
        'commit_application',
        'pending',
        'blocked',
        retriedAt.toISOString(),
        { kind: 'submission_event', ids: [applicationReceiptId] },
      ),
      committedAt,
    );
    const publicationFailedAt = new Date('2026-07-18T05:04:00.000Z');
    await transitionSubmissionApplicationLifecycle(
      transitionContext,
      backend,
      applicationId,
      request(
        '71000000-0000-4000-8000-000000000004',
        'fail_publication',
        'committed',
        'pending',
        committedAt.toISOString(),
        null,
      ),
      publicationFailedAt,
    );
    await expect(
      transitionSubmissionApplicationLifecycle(
        transitionContext,
        backend,
        applicationId,
        request(
          '71000000-0000-4000-8000-000000000005',
          'retry_publication',
          'committed',
          'failed',
          publicationFailedAt.toISOString(),
          null,
        ),
        new Date('2026-07-18T05:05:00.000Z'),
      ),
    ).resolves.toMatchObject({ action: 'publication_retried', toPublicationStatus: 'pending' });
  });

  it('rejects invalid receipt and expected-state combinations before backend reads', async () => {
    const backend = createBackend();
    expect(
      submissionApplicationTransitionRequestSchema.safeParse(
        request(
          '72000000-0000-4000-8000-000000000001',
          'commit_application',
          'pending',
          'blocked',
          registeredAt,
          { kind: 'export_release_decision', ids: [publicationReceiptId] },
        ),
      ).success,
    ).toBe(false);
    expect(
      submissionApplicationTransitionRequestSchema.safeParse(
        request(
          '72000000-0000-4000-8000-000000000002',
          'commit_publication',
          'pending',
          'blocked',
          registeredAt,
          { kind: 'export_release_decision', ids: [publicationReceiptId] },
        ),
      ).success,
    ).toBe(false);
    await expect(
      transitionSubmissionApplicationLifecycle(
        transitionContext,
        backend,
        applicationId,
        { operation: 'commit_application' },
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(backend.reads()).toBe(0);
  });

  it('replays identical requests and rejects changed content under the same UUID', async () => {
    const backend = createBackend();
    const transitionRequest = request(
      '73000000-0000-4000-8000-000000000001',
      'commit_application',
      'pending',
      'blocked',
      registeredAt,
      { kind: 'submission_event', ids: [applicationReceiptId] },
    );
    const changedAt = new Date('2026-07-18T05:01:00.000Z');
    await expect(
      transitionSubmissionApplicationLifecycle(
        transitionContext,
        backend,
        applicationId,
        transitionRequest,
        changedAt,
      ),
    ).resolves.toMatchObject({ state: 'committed' });
    await expect(
      transitionSubmissionApplicationLifecycle(
        transitionContext,
        backend,
        applicationId,
        transitionRequest,
        new Date('2026-07-18T06:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ state: 'replayed', changedAt: changedAt.toISOString() });
    await expect(
      transitionSubmissionApplicationLifecycle(
        transitionContext,
        backend,
        applicationId,
        { ...transitionRequest, receipt: { kind: 'submission_event', ids: [sourceDecisionEventId] } },
        changedAt,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
    expect(backend.commits).toHaveLength(1);
  });

  it('recovers an identical durable transition after a concurrent conflict', async () => {
    const backend = createBackend();
    backend.setFailAfterCommit(true);
    await expect(
      transitionSubmissionApplicationLifecycle(
        transitionContext,
        backend,
        applicationId,
        request(
          '74000000-0000-4000-8000-000000000001',
          'commit_application',
          'pending',
          'blocked',
          registeredAt,
          { kind: 'submission_event', ids: [applicationReceiptId] },
        ),
        new Date('2026-07-18T05:01:00.000Z'),
      ),
    ).resolves.toMatchObject({ state: 'replayed' });
  });

  it('fails authorization and stale-state checks closed', async () => {
    const backend = createBackend();
    await expect(
      readSubmissionApplicationLifecycle(
        { actorId: 'nope', actorType: 'human', capabilities: [] as never },
        backend,
        applicationId,
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(backend.reads()).toBe(0);

    await expect(
      transitionSubmissionApplicationLifecycle(
        transitionContext,
        backend,
        applicationId,
        request(
          '75000000-0000-4000-8000-000000000001',
          'commit_application',
          'pending',
          'blocked',
          '2026-07-18T04:59:59.000Z',
          { kind: 'submission_event', ids: [applicationReceiptId] },
        ),
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });
});
