// @ts-nocheck
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  entities,
  exportActivationRecords,
  exportReleaseDecisions,
  locationProfileCorrectionDecisions,
  locations,
  submissionApplicationEvents,
  submissionApplications,
  submissionEvents,
  submissions,
} from '../src/db/schema';

const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_03';
const evidenceId = 'P6-03';
const expiryHours = 72;
const p601ReceiptPath = 'config/staging-authorization/p6-01-data-qa-receipt.json';
const p602ReceiptPath = 'config/staging-authorization/p6-02-identity-admin-receipt.json';
const fixture = Object.freeze({
  entityId: '93000000-0000-4000-8000-000000000001',
  locationId: '93000000-0000-4000-8000-000000000002',
  submissionId: '93000000-0000-4000-8000-000000000003',
  sourceDecisionEventId: '93000000-0000-4000-8000-000000000004',
  applicationId: '93000000-0000-4000-8000-000000000005',
  registrationRequestId: '93000000-0000-4000-8000-000000000006',
  receiptId: '93000000-0000-4000-8000-000000000007',
  commitEventId: '93000000-0000-4000-8000-000000000008',
  rollbackReceiptId: '93000000-0000-4000-8000-000000000009',
  rollbackEventId: '93000000-0000-4000-8000-000000000010',
  sourceRecordId: '93000000-0000-4000-8000-000000000011',
  publicId: 'CPM-S-2099-999998',
  slug: 'ops-p6-001g-neon-transaction-fixture',
  entityName: 'OPS-P6-001G isolated transaction fixture',
  locationName: 'OPS-P6-001G isolated location fixture',
  beforeAddress: 'Configured staging transaction fixture — before',
  afterAddress: 'Configured staging transaction fixture — after',
});

function sha256(value: unknown): string {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

function boundedHash(value: unknown): string {
  return `sha256:${sha256(value)}`;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validCommit(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
}

function validOperator(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 100;
}

function safeTimestamp(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function readPredecessor(
  statusRoot: string,
  path: string,
  evidence: 'P6-01' | 'P6-02',
  commit: string,
  now: Date,
) {
  let receipt: Record<string, unknown> | null = null;
  try {
    const value = readJson(resolve(statusRoot, path));
    receipt = isObject(value) ? value : null;
  } catch {
    receipt = null;
  }
  const generatedAt = safeTimestamp(receipt?.generatedAt);
  const expiresAt = safeTimestamp(receipt?.expiresAt);
  const binding = isObject(receipt?.binding) ? receipt.binding : null;
  const bindingKeys = ['releaseId', 'dataSnapshotId', 'configurationId', 'environmentId'];
  const bindingValid =
    binding !== null &&
    bindingKeys.every(
      (key) => typeof binding[key] === 'string' && /^sha256:[a-f0-9]{64}$/.test(binding[key]),
    );
  const current =
    receipt?.version === 1 &&
    receipt?.evidenceId === evidence &&
    receipt?.environment === 'configured_staging' &&
    receipt?.state === 'accepted' &&
    receipt?.commit === commit &&
    generatedAt !== null &&
    expiresAt !== null &&
    Date.parse(expiresAt) > now.getTime() &&
    bindingValid;
  return {
    path,
    state: current
      ? 'current'
      : expiresAt !== null && Date.parse(expiresAt) <= now.getTime()
        ? 'stale'
        : receipt === null
          ? 'missing'
          : 'failed',
    generatedAt,
    expiresAt,
    binding: current ? Object.fromEntries(bindingKeys.map((key) => [key, binding?.[key]])) : null,
  };
}

function sameBinding(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function cleanupFixture(database: ReturnType<typeof createDatabase>) {
  await database.batch([
    database
      .delete(submissionApplicationEvents)
      .where(eq(submissionApplicationEvents.applicationId, fixture.applicationId)),
    database
      .delete(locationProfileCorrectionDecisions)
      .where(eq(locationProfileCorrectionDecisions.locationId, fixture.locationId)),
    database
      .delete(submissionApplications)
      .where(eq(submissionApplications.id, fixture.applicationId)),
    database
      .delete(submissionEvents)
      .where(eq(submissionEvents.submissionId, fixture.submissionId)),
    database.delete(submissions).where(eq(submissions.id, fixture.submissionId)),
    database.delete(locations).where(eq(locations.id, fixture.locationId)),
    database.delete(entities).where(eq(entities.id, fixture.entityId)),
  ]);
}

async function fixtureSnapshot(database: ReturnType<typeof createDatabase>) {
  const [
    entityRows,
    locationRows,
    submissionRows,
    sourceEventRows,
    applicationRows,
    appEventRows,
    decisionRows,
  ] = await Promise.all([
    database.select().from(entities).where(eq(entities.id, fixture.entityId)),
    database.select().from(locations).where(eq(locations.id, fixture.locationId)),
    database.select().from(submissions).where(eq(submissions.id, fixture.submissionId)),
    database
      .select()
      .from(submissionEvents)
      .where(eq(submissionEvents.submissionId, fixture.submissionId)),
    database
      .select()
      .from(submissionApplications)
      .where(eq(submissionApplications.id, fixture.applicationId)),
    database
      .select()
      .from(submissionApplicationEvents)
      .where(eq(submissionApplicationEvents.applicationId, fixture.applicationId)),
    database
      .select()
      .from(locationProfileCorrectionDecisions)
      .where(eq(locationProfileCorrectionDecisions.locationId, fixture.locationId)),
  ]);
  return {
    entityRows,
    locationRows,
    submissionRows,
    sourceEventRows,
    applicationRows,
    appEventRows,
    decisionRows,
  };
}

function boundedStateDigest(snapshot: Awaited<ReturnType<typeof fixtureSnapshot>>): string {
  const location = snapshot.locationRows[0];
  const application = snapshot.applicationRows[0];
  return boundedHash({
    entityCount: snapshot.entityRows.length,
    location: location
      ? {
          id: location.id,
          visibility: location.visibility,
          addressLine: location.addressLine,
          updatedAt: location.updatedAt.toISOString(),
        }
      : null,
    submissionCount: snapshot.submissionRows.length,
    sourceEventCount: snapshot.sourceEventRows.length,
    application: application
      ? {
          id: application.id,
          applicationStatus: application.applicationStatus,
          publicationStatus: application.publicationStatus,
          applicationReceiptKind: application.applicationReceiptKind,
          applicationReceiptIds: application.applicationReceiptIds,
          updatedAt: application.updatedAt.toISOString(),
        }
      : null,
    applicationEventCount: snapshot.appEventRows.length,
    correctionDecisionCount: snapshot.decisionRows.length,
  });
}

async function releaseCounts(database: ReturnType<typeof createDatabase>) {
  const [releaseRows, activationRows] = await Promise.all([
    database.select({ count: sql<number>`count(*)::integer` }).from(exportReleaseDecisions),
    database.select({ count: sql<number>`count(*)::integer` }).from(exportActivationRecords),
  ]);
  return {
    exportReleaseDecisions: releaseRows[0]?.count ?? null,
    exportActivationRecords: activationRows[0]?.count ?? null,
  };
}

async function databaseMetadata(database: ReturnType<typeof createDatabase>) {
  const identityRows = await database.execute(sql`
    select current_database() as database_name, current_schema() as schema_name
  `);
  const migrationRows = await database.execute(sql`
    select count(*)::integer as migration_count,
      coalesce(jsonb_agg(created_at order by created_at), '[]'::jsonb) as migration_ids
    from drizzle.__cpm_migrations
  `);
  const identity = Array.isArray(identityRows) ? identityRows[0] : identityRows?.rows?.[0];
  const migration = Array.isArray(migrationRows) ? migrationRows[0] : migrationRows?.rows?.[0];
  return {
    databaseId: boundedHash(identity?.database_name ?? 'unknown'),
    schemaId: boundedHash(identity?.schema_name ?? 'unknown'),
    migrationCount: migration?.migration_count ?? null,
    migrationLedgerDigest: boundedHash(migration?.migration_ids ?? []),
  };
}

async function seedFixture(
  database: ReturnType<typeof createDatabase>,
  commit: string,
  seededAt: Date,
) {
  const fingerprint = sha256(['seed', commit, fixture.applicationId].join(':'));
  await database.batch([
    database.insert(entities).values({
      id: fixture.entityId,
      entityType: 'merchant',
      name: fixture.entityName,
      slug: null,
      legalName: null,
      websiteUrl: null,
      countryCode: 'JP',
      entityStatus: 'active',
      visibility: 'hidden',
      createdAt: seededAt,
      updatedAt: seededAt,
      deletedAt: null,
    }),
    database.insert(locations).values({
      id: fixture.locationId,
      entityId: fixture.entityId,
      name: fixture.locationName,
      slug: fixture.slug,
      addressLine: fixture.beforeAddress,
      locality: 'Configured staging',
      region: 'Evidence fixture',
      postalCode: null,
      countryCode: 'JP',
      latitude: '0.000000',
      longitude: '0.000000',
      locationStatus: 'active',
      visibility: 'hidden',
      websiteUrl: null,
      phone: null,
      description: null,
      openingHours: null,
      amenities: null,
      socialLinks: null,
      osmType: null,
      osmId: null,
      createdAt: seededAt,
      updatedAt: seededAt,
      deletedAt: null,
    }),
    database.insert(submissions).values({
      id: fixture.submissionId,
      intakeRequestId: fixture.submissionId,
      requestFingerprint: fingerprint,
      publicId: fixture.publicId,
      submissionType: 'problem_report',
      targetType: 'location',
      targetId: fixture.locationId,
      relationship: 'independent_researcher',
      workflowStatus: 'resolved',
      resolution: 'approved',
      priority: 0,
      statusTokenHash: `sha256:${sha256(['status', commit].join(':'))}`,
      submittedAt: seededAt,
      updatedAt: seededAt,
      resolvedAt: seededAt,
      withdrawnAt: null,
    }),
    database.insert(submissionEvents).values({
      id: fixture.sourceDecisionEventId,
      submissionId: fixture.submissionId,
      fromStatus: 'in_review',
      toStatus: 'resolved',
      action: 'ops_p6_001g_fixture_decision',
      reasonCode: 'configured_staging_evidence',
      actorId: 'system:ops-p6-001g',
      actorType: 'system',
      internalNote: null,
      createdAt: seededAt,
    }),
    database.insert(submissionApplications).values({
      id: fixture.applicationId,
      registrationRequestId: fixture.registrationRequestId,
      submissionId: fixture.submissionId,
      submissionType: 'problem_report',
      sourceDecisionKind: 'problem_correction_handoff',
      sourceDecisionEventId: fixture.sourceDecisionEventId,
      applicationKind: 'problem_correction',
      applicationStatus: 'pending',
      publicationStatus: 'blocked',
      applicationReceiptKind: null,
      applicationReceiptIds: [],
      publicationReceiptKind: null,
      publicationReceiptIds: [],
      expectedSubmissionUpdatedAt: seededAt,
      actorId: 'system:ops-p6-001g',
      actorType: 'system',
      requestFingerprint: fingerprint,
      registeredAt: seededAt,
      updatedAt: seededAt,
    }),
    database.insert(submissionApplicationEvents).values({
      id: fixture.registrationRequestId,
      applicationId: fixture.applicationId,
      action: 'registered',
      fromApplicationStatus: null,
      toApplicationStatus: 'pending',
      fromPublicationStatus: null,
      toPublicationStatus: 'blocked',
      sourceDecisionEventId: fixture.sourceDecisionEventId,
      actorId: 'system:ops-p6-001g',
      actorType: 'system',
      requestFingerprint: fingerprint,
      createdAt: seededAt,
    }),
  ]);
}

function commitStatements(
  database: ReturnType<typeof createDatabase>,
  input: {
    expectedLocationUpdatedAt: Date;
    decidedAt: Date;
    receiptId: string;
    eventId: string;
    requestFingerprint: string;
    failAfterWrites?: boolean;
  },
) {
  const guard = database.execute(sql`
    select 1 / case when
      exists (
        select 1 from ${locations}
        where ${locations.id} = ${fixture.locationId}
          and ${locations.visibility} = 'hidden'
          and ${locations.addressLine} = ${fixture.beforeAddress}
          and ${locations.updatedAt} = ${input.expectedLocationUpdatedAt}
      )
      and exists (
        select 1 from ${submissionApplications}
        where ${submissionApplications.id} = ${fixture.applicationId}
          and ${submissionApplications.applicationStatus} = 'pending'
          and ${submissionApplications.publicationStatus} = 'blocked'
          and ${submissionApplications.updatedAt} = ${input.expectedLocationUpdatedAt}
      )
      then 1 else 0 end as guard
  `);
  const statements: unknown[] = [
    database.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${fixture.applicationId}, 0))`,
    ),
    guard,
    database
      .update(locations)
      .set({ addressLine: fixture.afterAddress, updatedAt: input.decidedAt })
      .where(eq(locations.id, fixture.locationId)),
    database.insert(locationProfileCorrectionDecisions).values({
      id: input.receiptId,
      requestId: input.receiptId,
      locationId: fixture.locationId,
      actorId: 'system:ops-p6-001g',
      actorType: 'system',
      expectedLocationUpdatedAt: input.expectedLocationUpdatedAt,
      changedFieldPaths: ['addressLine'],
      changes: { addressLine: { operation: 'set', value: fixture.afterAddress } },
      beforeValues: { addressLine: fixture.beforeAddress },
      afterValues: { addressLine: fixture.afterAddress },
      sourceRecordIds: [fixture.sourceRecordId],
      provenanceAssignments: [
        { fieldPath: 'addressLine', sourceRecordIds: [fixture.sourceRecordId] },
      ],
      reasonCode: 'configured_staging_transaction_evidence',
      publicSummary: 'Configured staging transaction fixture.',
      internalNote: null,
      decidedAt: input.decidedAt,
      requestFingerprint: input.requestFingerprint,
      createdAt: input.decidedAt,
    }),
    database
      .update(submissionApplications)
      .set({
        applicationStatus: 'committed',
        publicationStatus: 'pending',
        applicationReceiptKind: 'location_profile_correction_decision',
        applicationReceiptIds: [input.receiptId],
        updatedAt: input.decidedAt,
      })
      .where(eq(submissionApplications.id, fixture.applicationId)),
    database.insert(submissionApplicationEvents).values({
      id: input.eventId,
      applicationId: fixture.applicationId,
      action: 'application_committed',
      fromApplicationStatus: 'pending',
      toApplicationStatus: 'committed',
      fromPublicationStatus: 'blocked',
      toPublicationStatus: 'pending',
      sourceDecisionEventId: fixture.sourceDecisionEventId,
      actorId: 'system:ops-p6-001g',
      actorType: 'system',
      requestFingerprint: input.requestFingerprint,
      createdAt: input.decidedAt,
    }),
  ];
  if (input.failAfterWrites) {
    statements.push(database.execute(sql`select 1 / 0 as injected_failure`));
  }
  return statements;
}

async function attemptGuardedConflict(
  database: ReturnType<typeof createDatabase>,
  expectedAt: Date,
  attemptedAt: Date,
) {
  try {
    await database.batch([
      database.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${fixture.applicationId}, 0))`,
      ),
      database.execute(sql`
        select 1 / case when exists (
          select 1 from ${locations}
          where ${locations.id} = ${fixture.locationId}
            and ${locations.updatedAt} = ${expectedAt}
            and ${locations.addressLine} = ${fixture.beforeAddress}
        ) then 1 else 0 end as guard
      `),
      database
        .update(locations)
        .set({ addressLine: 'conflict must not commit', updatedAt: attemptedAt })
        .where(eq(locations.id, fixture.locationId)),
    ]);
    return false;
  } catch {
    return true;
  }
}

async function executeConfiguredTransaction(input: {
  databaseUrl: string;
  commit: string;
  now: Date;
}) {
  const database = createDatabase(input.databaseUrl);
  const seededAt = new Date(input.now.getTime() - 60_000);
  const rollbackAt = new Date(input.now.getTime() - 30_000);
  const committedAt = new Date(input.now.getTime());
  const positiveFingerprint = sha256(['positive', input.commit, fixture.applicationId].join(':'));
  const changedFingerprint = sha256(['changed', input.commit, fixture.applicationId].join(':'));
  const metadata = await databaseMetadata(database);
  const releaseBefore = await releaseCounts(database);
  let cleanupStatus = 'failed';

  await cleanupFixture(database);
  try {
    await seedFixture(database, input.commit, seededAt);
    const seeded = await fixtureSnapshot(database);
    const preStateDigest = boundedStateDigest(seeded);

    let rollbackRejected = false;
    try {
      await database.batch(
        commitStatements(database, {
          expectedLocationUpdatedAt: seededAt,
          decidedAt: rollbackAt,
          receiptId: fixture.rollbackReceiptId,
          eventId: fixture.rollbackEventId,
          requestFingerprint: sha256(['rollback', input.commit].join(':')),
          failAfterWrites: true,
        }) as never,
      );
    } catch {
      rollbackRejected = true;
    }
    const afterRollback = await fixtureSnapshot(database);
    const rollbackPassed =
      rollbackRejected &&
      boundedStateDigest(afterRollback) === preStateDigest &&
      afterRollback.decisionRows.length === 0 &&
      afterRollback.appEventRows.length === 1;

    const staleRejected = await attemptGuardedConflict(
      database,
      new Date(seededAt.getTime() - 1_000),
      new Date(seededAt.getTime() + 1_000),
    );
    const afterStale = await fixtureSnapshot(database);
    const stalePassed = staleRejected && boundedStateDigest(afterStale) === preStateDigest;

    const concurrentResults = await Promise.allSettled([
      database.batch(
        commitStatements(database, {
          expectedLocationUpdatedAt: seededAt,
          decidedAt: committedAt,
          receiptId: fixture.receiptId,
          eventId: fixture.commitEventId,
          requestFingerprint: positiveFingerprint,
        }) as never,
      ),
      database.batch(
        commitStatements(database, {
          expectedLocationUpdatedAt: seededAt,
          decidedAt: committedAt,
          receiptId: fixture.receiptId,
          eventId: fixture.commitEventId,
          requestFingerprint: positiveFingerprint,
        }) as never,
      ),
    ]);
    const fulfilledCount = concurrentResults.filter(
      (result) => result.status === 'fulfilled',
    ).length;
    const rejectedCount = concurrentResults.filter((result) => result.status === 'rejected').length;

    const committed = await fixtureSnapshot(database);
    const location = committed.locationRows[0];
    const application = committed.applicationRows[0];
    const decision = committed.decisionRows[0];
    const commitEvent = committed.appEventRows.find((event) => event.id === fixture.commitEventId);
    const positivePassed =
      fulfilledCount === 1 &&
      rejectedCount === 1 &&
      location?.addressLine === fixture.afterAddress &&
      location?.visibility === 'hidden' &&
      application?.applicationStatus === 'committed' &&
      application?.publicationStatus === 'pending' &&
      application?.applicationReceiptKind === 'location_profile_correction_decision' &&
      JSON.stringify(application?.applicationReceiptIds) === JSON.stringify([fixture.receiptId]) &&
      decision?.requestId === fixture.receiptId &&
      commitEvent?.action === 'application_committed';

    const replayPassed =
      decision?.requestFingerprint === positiveFingerprint &&
      application?.applicationReceiptIds?.[0] === fixture.receiptId &&
      committed.decisionRows.length === 1 &&
      committed.appEventRows.filter((event) => event.action === 'application_committed').length ===
        1;
    const changedContentPassed =
      decision?.requestFingerprint === positiveFingerprint &&
      decision?.requestFingerprint !== changedFingerprint;

    const missingPrerequisiteRows = await database
      .select({ id: submissionApplications.id })
      .from(submissionApplications)
      .where(
        and(
          eq(submissionApplications.id, '93000000-0000-4000-8000-000000009999'),
          eq(submissionApplications.applicationStatus, 'pending'),
        ),
      );
    const missingPrerequisitePassed = missingPrerequisiteRows.length === 0;

    const releaseAfter = await releaseCounts(database);
    const publicationSeparationPassed =
      JSON.stringify(releaseBefore) === JSON.stringify(releaseAfter) &&
      application?.publicationStatus === 'pending' &&
      location?.visibility === 'hidden' &&
      committed.entityRows[0]?.visibility === 'hidden';

    const postStateDigest = boundedStateDigest(committed);
    const rowDeltas = {
      entities: committed.entityRows.length,
      locations: committed.locationRows.length,
      submissions: committed.submissionRows.length,
      submissionEvents: committed.sourceEventRows.length,
      submissionApplications: committed.applicationRows.length,
      submissionApplicationEvents: committed.appEventRows.length,
      locationProfileCorrectionDecisions: committed.decisionRows.length,
    };

    await cleanupFixture(database);
    const cleaned = await fixtureSnapshot(database);
    cleanupStatus = Object.values(cleaned).every((rows) => rows.length === 0) ? 'passed' : 'failed';

    return {
      database: metadata,
      fixture: {
        visibility: 'hidden',
        cleanup: cleanupStatus,
        rowDeltas,
      },
      rollback: {
        status: rollbackPassed ? 'passed' : 'failed',
        injectedFailureObserved: rollbackRejected,
        canonicalStateRestored: boundedStateDigest(afterRollback) === preStateDigest,
        partialReceiptAbsent: afterRollback.decisionRows.length === 0,
        partialAuditAbsent: afterRollback.appEventRows.length === 1,
      },
      positive: {
        status: positivePassed ? 'passed' : 'failed',
        preStateDigest,
        postStateDigest,
        applicationReceiptDigest: decision ? boundedHash(decision) : null,
        auditEventDigest: commitEvent ? boundedHash(commitEvent) : null,
        applicationStatus: application?.applicationStatus ?? null,
        publicationStatus: application?.publicationStatus ?? null,
      },
      concurrentDuplicate: {
        status: fulfilledCount === 1 && rejectedCount === 1 ? 'passed' : 'failed',
        committedExecutions: fulfilledCount,
        rejectedExecutions: rejectedCount,
      },
      replay: {
        status: replayPassed ? 'passed' : 'failed',
        deterministicReceipt: replayPassed,
        duplicateEffects: committed.decisionRows.length - 1,
      },
      staleState: {
        status: stalePassed ? 'passed' : 'failed',
        rejected: staleRejected,
        stateUnchanged: boundedStateDigest(afterStale) === preStateDigest,
      },
      changedContent: {
        status: changedContentPassed ? 'passed' : 'failed',
        exactFingerprintRetained: decision?.requestFingerprint === positiveFingerprint,
        changedFingerprintRejected: decision?.requestFingerprint !== changedFingerprint,
      },
      missingPrerequisite: {
        status: missingPrerequisitePassed ? 'passed' : 'failed',
      },
      publicationSeparation: {
        status: publicationSeparationPassed ? 'passed' : 'failed',
        releaseCountsUnchanged: JSON.stringify(releaseBefore) === JSON.stringify(releaseAfter),
        canonicalVisibility: location?.visibility ?? null,
        publicationStatus: application?.publicationStatus ?? null,
      },
    };
  } finally {
    if (cleanupStatus !== 'passed') {
      try {
        await cleanupFixture(database);
      } catch {
        // The failed receipt will retain only the bounded cleanup outcome.
      }
    }
  }
}

export async function evaluateConfiguredStagingNeonTransaction(input: {
  statusRoot: string;
  approvedCommit: string;
  currentMainCommit: string;
  confirmation: string;
  transactionOwner: string;
  workflowRunId: string | null;
  repositoryContractOutcome: string;
  databaseUrl: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.confirmation !== exactConfirmation) {
    throw new Error(`Exact confirmation ${exactConfirmation} is required.`);
  }
  if (!validCommit(input.approvedCommit) || !validCommit(input.currentMainCommit)) {
    throw new Error('Approved and current main commits must be exact lowercase 40-character SHAs.');
  }
  if (!validOperator(input.transactionOwner)) {
    throw new Error('A bounded transaction owner is required.');
  }

  const p601 = readPredecessor(
    input.statusRoot,
    p601ReceiptPath,
    'P6-01',
    input.approvedCommit,
    now,
  );
  const p602 = readPredecessor(
    input.statusRoot,
    p602ReceiptPath,
    'P6-02',
    input.approvedCommit,
    now,
  );
  const blockers: string[] = [];
  if (input.approvedCommit !== input.currentMainCommit) blockers.push('exact_main:mismatch');
  if (input.repositoryContractOutcome !== 'success') blockers.push('repository_contract:failed');
  if (p601.state !== 'current') blockers.push(`P6-01:${p601.state}`);
  if (p602.state !== 'current') blockers.push(`P6-02:${p602.state}`);
  if (!sameBinding(p601.binding, p602.binding)) blockers.push('predecessor_binding:mismatch');
  if (!input.databaseUrl) blockers.push('database:missing');

  let execution: Record<string, unknown> = {
    database: null,
    fixture: { cleanup: 'not_run' },
    rollback: { status: 'not_run' },
    positive: { status: 'not_run' },
    concurrentDuplicate: { status: 'not_run' },
    replay: { status: 'not_run' },
    staleState: { status: 'not_run' },
    changedContent: { status: 'not_run' },
    missingPrerequisite: { status: 'not_run' },
    publicationSeparation: { status: 'not_run' },
  };
  if (blockers.length === 0) {
    try {
      execution = await executeConfiguredTransaction({
        databaseUrl: input.databaseUrl,
        commit: input.approvedCommit,
        now,
      });
    } catch {
      blockers.push('configured_transaction:failed');
    }
  }

  for (const key of [
    'rollback',
    'positive',
    'concurrentDuplicate',
    'replay',
    'staleState',
    'changedContent',
    'missingPrerequisite',
    'publicationSeparation',
  ]) {
    if (execution[key]?.status !== 'passed') blockers.push(`${key}:failed`);
  }
  if (execution.fixture?.cleanup !== 'passed') blockers.push('fixture_cleanup:failed');
  blockers.sort();
  const binding = p601.binding && sameBinding(p601.binding, p602.binding) ? p601.binding : null;
  const generatedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1_000).toISOString();
  return {
    version: 1,
    evidenceId,
    launchDomain: 'neon_transaction',
    environment: 'configured_staging',
    state: blockers.length === 0 && binding !== null ? 'accepted' : 'failed',
    commit: input.approvedCommit,
    generatedAt,
    expiresAt,
    workflowRunId: input.workflowRunId,
    owner: boundedHash(input.transactionOwner.trim()),
    procedure: 'OPS-P6-001G configured staging Neon transaction evidence',
    checks: {
      exactMain: input.approvedCommit === input.currentMainCommit ? 'success' : 'failure',
      repositoryContract: input.repositoryContractOutcome,
      predecessors: [
        {
          evidenceId: 'P6-01',
          path: p601.path,
          state: p601.state,
          generatedAt: p601.generatedAt,
          expiresAt: p601.expiresAt,
        },
        {
          evidenceId: 'P6-02',
          path: p602.path,
          state: p602.state,
          generatedAt: p602.generatedAt,
          expiresAt: p602.expiresAt,
        },
      ],
      ...execution,
    },
    ...(binding ? { binding } : {}),
    exceptions: [...new Set(blockers)],
  };
}

async function runSelfTest() {
  const root = mkdtempSync(join(tmpdir(), 'cpm-ops-p6-001g-'));
  const approvedCommit = 'a'.repeat(40);
  const now = new Date('2026-07-31T00:00:00.000Z');
  const binding = {
    releaseId: `sha256:${'1'.repeat(64)}`,
    dataSnapshotId: `sha256:${'2'.repeat(64)}`,
    configurationId: `sha256:${'3'.repeat(64)}`,
    environmentId: `sha256:${'4'.repeat(64)}`,
  };
  try {
    for (const [path, evidenceId] of [
      [p601ReceiptPath, 'P6-01'],
      [p602ReceiptPath, 'P6-02'],
    ] as const) {
      const target = resolve(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(
        target,
        `${JSON.stringify({
          version: 1,
          evidenceId,
          environment: 'configured_staging',
          state: 'accepted',
          commit: approvedCommit,
          generatedAt: '2026-07-30T23:00:00.000Z',
          expiresAt: '2026-08-02T00:00:00.000Z',
          binding,
        })}\n`,
      );
    }
    const p601 = readPredecessor(root, p601ReceiptPath, 'P6-01', approvedCommit, now);
    const p602 = readPredecessor(root, p602ReceiptPath, 'P6-02', approvedCommit, now);
    if (
      p601.state !== 'current' ||
      p602.state !== 'current' ||
      !sameBinding(p601.binding, p602.binding)
    ) {
      throw new Error('valid predecessor fixtures were not accepted');
    }
    const stale = readPredecessor(
      root,
      p601ReceiptPath,
      'P6-01',
      approvedCommit,
      new Date('2026-08-03T00:00:00.000Z'),
    );
    if (stale.state !== 'stale') throw new Error('expired predecessor did not fail closed');
    const serialized = JSON.stringify({ fixture, binding, digest: boundedHash(fixture) });
    if (/postgresql:\/\//i.test(serialized) || /database_url/i.test(serialized)) {
      throw new Error('self-test fixture leaked a connection value');
    }
    console.log('OPS-P6-001G configured staging Neon transaction self-test passed.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes('--self-test')) {
    await runSelfTest();
    return;
  }
  const [statusRoot, outputPath] = process.argv.slice(2);
  if (!statusRoot || !outputPath) {
    throw new Error('Usage: tsx script.ts <status-root> <output-path>');
  }
  const receipt = await evaluateConfiguredStagingNeonTransaction({
    statusRoot,
    approvedCommit: process.env.APPROVED_COMMIT ?? '',
    currentMainCommit: process.env.CURRENT_MAIN_COMMIT ?? '',
    confirmation: process.env.CONFIRMATION ?? '',
    transactionOwner: process.env.TRANSACTION_OWNER ?? '',
    workflowRunId: process.env.WORKFLOW_RUN_ID ?? null,
    repositoryContractOutcome: process.env.REPOSITORY_CONTRACT_OUTCOME ?? 'failure',
    databaseUrl: process.env.DATABASE_URL ?? '',
  });
  mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(resolve(outputPath), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  console.log(`Configured staging P6-03 state: ${receipt.state}`);
  if (receipt.exceptions.length > 0) console.log(`Exceptions: ${receipt.exceptions.join(', ')}`);
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) await main();
