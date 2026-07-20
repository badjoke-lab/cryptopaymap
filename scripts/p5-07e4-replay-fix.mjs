import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(path, oldText, newText, label) {
  let source = readFileSync(path, 'utf8');
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) throw new Error(`${label} marker is missing.`);
  source = source.replace(oldText, newText);
  writeFileSync(path, source);
}

const contractPath = 'src/submissions/business-claim-payment-application-contract.ts';
replaceOnce(
  contractPath,
  `export const businessClaimPaymentVerificationReferenceSchema = z
  .object({ claimId: z.uuid(), verificationEventId: z.uuid() })
  .strict();

export const businessClaimPaymentApplicationEventPayloadSchema = z`,
  `export const businessClaimPaymentVerificationReferenceSchema = z
  .object({ claimId: z.uuid(), verificationEventId: z.uuid() })
  .strict();

export const businessClaimPaymentFinalClaimAssetSetSchema = z
  .object({
    claimId: z.uuid(),
    rowIds: z.array(z.uuid()).min(1).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.rowIds).size !== value.rowIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['rowIds'],
        message: 'Final Claim Asset row IDs must be unique.',
      });
    }
  });

export const businessClaimPaymentApplicationEventPayloadSchema = z`,
  'final Claim Asset set schema',
);
replaceOnce(
  contractPath,
  `    alreadyPresentClaimAssetRowIds: z.array(z.uuid()).max(20),
    verificationEvents: z.array(businessClaimPaymentVerificationReferenceSchema).min(1).max(20),`,
  `    alreadyPresentClaimAssetRowIds: z.array(z.uuid()).max(20),
    finalClaimAssetSets: z.array(businessClaimPaymentFinalClaimAssetSetSchema).min(1).max(20),
    verificationEvents: z.array(businessClaimPaymentVerificationReferenceSchema).min(1).max(20),`,
  'event final Claim Asset sets',
);
replaceOnce(
  contractPath,
  `    const verificationIds = payload.verificationEvents.map((item) => item.verificationEventId);`,
  `    const finalClaimIds = payload.finalClaimAssetSets.map((item) => item.claimId);
    const finalRowIds = payload.finalClaimAssetSets.flatMap((item) => item.rowIds);
    if (
      new Set(finalClaimIds).size !== finalClaimIds.length ||
      new Set(finalRowIds).size !== finalRowIds.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['finalClaimAssetSets'],
        message: 'Final Claim and Claim Asset row IDs must be globally unique.',
      });
    }
    const verificationIds = payload.verificationEvents.map((item) => item.verificationEventId);`,
  'event final set uniqueness',
);
replaceOnce(
  contractPath,
  `export type BusinessClaimPaymentVerificationReference = z.infer<
  typeof businessClaimPaymentVerificationReferenceSchema
>;
export type BusinessClaimPaymentApplicationEventPayload = z.infer<`,
  `export type BusinessClaimPaymentVerificationReference = z.infer<
  typeof businessClaimPaymentVerificationReferenceSchema
>;
export type BusinessClaimPaymentFinalClaimAssetSet = z.infer<
  typeof businessClaimPaymentFinalClaimAssetSetSchema
>;
export type BusinessClaimPaymentApplicationEventPayload = z.infer<`,
  'final Claim Asset set type',
);

const servicePath = 'src/admin/submissions/business-claim-payment-application.ts';
replaceOnce(
  servicePath,
  `  type BusinessClaimPaymentApplicationEventPayload,
  type BusinessClaimPaymentApplicationReceipt,`,
  `  type BusinessClaimPaymentApplicationEventPayload,
  type BusinessClaimPaymentApplicationReceipt,
  type BusinessClaimPaymentFinalClaimAssetSet,`,
  'service final set import',
);
replaceOnce(
  servicePath,
  `  expectedExistingClaims: BusinessClaimPaymentExpectedClaim[];
  items: BusinessClaimPaymentPlanItem[];
  sourceRecord: BusinessClaimPaymentSourceRecordCommand;`,
  `  expectedExistingClaims: BusinessClaimPaymentExpectedClaim[];
  items: BusinessClaimPaymentPlanItem[];
  finalClaimAssetSets: BusinessClaimPaymentFinalClaimAssetSet[];
  sourceRecord: BusinessClaimPaymentSourceRecordCommand;`,
  'commit command final sets',
);
replaceOnce(
  servicePath,
  `function exactClaim(
  state: BusinessClaimPaymentApplicationState,`,
  `function deriveFinalClaimAssetSets(
  payload: BusinessClaimPaymentPlanEventPayload,
  expectedExistingClaims: BusinessClaimPaymentExpectedClaim[],
): BusinessClaimPaymentFinalClaimAssetSet[] {
  const rowIdsByClaim = new Map<string, Set<string>>();
  for (const claim of payload.plannedClaims) {
    rowIdsByClaim.set(claim.claimId, new Set());
  }
  for (const claim of expectedExistingClaims) {
    rowIdsByClaim.set(claim.claimId, new Set(claim.expectedRows.map((row) => row.rowId)));
  }
  for (const item of payload.items) {
    const rowIds = rowIdsByClaim.get(item.targetClaimId) ?? new Set<string>();
    rowIds.add(itemRowId(item));
    rowIdsByClaim.set(item.targetClaimId, rowIds);
  }
  return [...rowIdsByClaim.entries()]
    .map(([claimId, rowIds]) => ({ claimId, rowIds: [...rowIds].sort() }))
    .sort((left, right) => left.claimId.localeCompare(right.claimId));
}

function validateFinalClaimAssetSets(
  payload: BusinessClaimPaymentPlanEventPayload,
  finalSets: BusinessClaimPaymentFinalClaimAssetSet[],
): void {
  const affectedClaimIds = [...new Set(payload.items.map((item) => item.targetClaimId))].sort();
  const finalClaimIds = finalSets.map((item) => item.claimId).sort();
  if (JSON.stringify(affectedClaimIds) !== JSON.stringify(finalClaimIds)) {
    throw new BusinessClaimPaymentApplicationError(
      'conflict',
      'The canonical receipt does not bind every affected Claim to one final payment set.',
    );
  }
  const setByClaim = new Map(finalSets.map((item) => [item.claimId, new Set(item.rowIds)]));
  for (const item of payload.items) {
    if (!setByClaim.get(item.targetClaimId)?.has(itemRowId(item))) {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'The canonical receipt omits a planned Claim Asset row.',
      );
    }
  }
  for (const planned of payload.plannedClaims) {
    const plannedIds = payload.items
      .filter((item) => item.targetClaimId === planned.claimId)
      .map(itemRowId)
      .sort();
    const finalIds = [...(setByClaim.get(planned.claimId) ?? new Set<string>())].sort();
    if (JSON.stringify(plannedIds) !== JSON.stringify(finalIds)) {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'A new candidate Claim receipt contains an unexpected Claim Asset row.',
      );
    }
  }
}

function exactClaim(
  state: BusinessClaimPaymentApplicationState,`,
  'final Claim Asset set helpers',
);
replaceOnce(
  servicePath,
  `  const sourceContentHash = await sha256(execution.sourcePayload);
  const requestFingerprint = await sha256({`,
  `  const sourceContentHash = await sha256(execution.sourcePayload);
  const eventPayload = parseBusinessClaimPaymentApplicationEventPayload(
    state.applicationEvent?.internalNote ?? null,
  );
  const finalClaimAssetSets =
    eventPayload?.finalClaimAssetSets ??
    deriveFinalClaimAssetSets(execution.payload, execution.expectedExistingClaims);
  validateFinalClaimAssetSets(execution.payload, finalClaimAssetSets);
  const requestFingerprint = await sha256({`,
  'event-first fingerprint preparation',
);
replaceOnce(
  servicePath,
  `    plan: execution.payload,
    verificationEvents,
  });

  const eventPayload = parseBusinessClaimPaymentApplicationEventPayload(
    state.applicationEvent?.internalNote ?? null,
  );`,
  `    plan: execution.payload,
    finalClaimAssetSets,
    verificationEvents,
  });`,
  'fingerprint final sets',
);
replaceOnce(
  servicePath,
  `  for (const guard of execution.payload.existingClaims) {
    const claim = exactClaim(state, guard.claimId);
    if (claim === null || claim.deletedAt !== null || claim.updatedAt !== appliedAt) {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'An affected existing Claim does not match the canonical payment receipt.',
      );
    }
  }`,
  `  for (const guard of execution.payload.existingClaims) {
    const claim = exactClaim(state, guard.claimId);
    const claimItems = execution.payload.items.filter(
      (item) => item.targetClaimId === guard.claimId,
    );
    if (
      claim === null ||
      claim.deletedAt !== null ||
      !['candidate', 'confirmed', 'stale'].includes(claim.claimStatus) ||
      claim.entityId !== execution.payload.target.entityId ||
      claim.locationId !== execution.payload.target.locationId ||
      claim.updatedAt !== appliedAt ||
      claimItems.some(
        (item) =>
          item.targetKind !== 'existing_claim' ||
          item.proposal.routeType !== claim.routeType ||
          (item.processor?.id ?? null) !== claim.processorId,
      )
    ) {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'An affected existing Claim does not match the canonical payment receipt.',
      );
    }
  }`,
  'existing Claim replay guard',
);
replaceOnce(
  servicePath,
  `      row.contractAddress !== item.proposal.contractAddress ||
      row.isPrimary !== item.isPrimary ||
      row.notes !== null ||
      (item.operation === 'insert_claim_asset' &&
        (row.createdAt !== appliedAt || row.updatedAt !== appliedAt))`,
  `      row.contractAddress !== item.proposal.contractAddress ||
      row.isPrimary !== item.isPrimary ||
      (item.operation === 'insert_claim_asset' &&
        (row.notes !== null || row.createdAt !== appliedAt || row.updatedAt !== appliedAt))`,
  'Claim Asset notes replay guard',
);
replaceOnce(
  servicePath,
  `  if (
    state.sourceRecord === null ||`,
  `  for (const finalSet of eventPayload.finalClaimAssetSets) {
    const actualRowIds = rowsForClaim(state, finalSet.claimId)
      .map((row) => row.rowId)
      .sort();
    if (JSON.stringify(actualRowIds) !== JSON.stringify(finalSet.rowIds)) {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'A canonical Claim contains an unexpected or missing Claim Asset row.',
      );
    }
  }
  if (
    state.sourceRecord === null ||`,
  'exact final row set replay',
);
replaceOnce(
  servicePath,
  `        expectedExistingClaims: execution.expectedExistingClaims,
        items: execution.payload.items,
        sourceRecord: {`,
  `        expectedExistingClaims: execution.expectedExistingClaims,
        items: execution.payload.items,
        finalClaimAssetSets,
        sourceRecord: {`,
  'commit final sets',
);

const backendPath = 'src/admin/submissions/drizzle-business-claim-payment-application-backend.ts';
replaceOnce(
  backendPath,
  `    JSON.stringify(payload.alreadyPresentClaimAssetRowIds) !==
      JSON.stringify(alreadyPresentClaimAssetRowIds) ||
    JSON.stringify(payload.verificationEvents) !== JSON.stringify(verificationReferences)`,
  `    JSON.stringify(payload.alreadyPresentClaimAssetRowIds) !==
      JSON.stringify(alreadyPresentClaimAssetRowIds) ||
    JSON.stringify(payload.finalClaimAssetSets) !==
      JSON.stringify(command.finalClaimAssetSets) ||
    JSON.stringify(payload.verificationEvents) !== JSON.stringify(verificationReferences)`,
  'backend replay final sets',
);
replaceOnce(
  backendPath,
  `        alreadyPresentClaimAssetRowIds,
        verificationEvents: verificationReferences,`,
  `        alreadyPresentClaimAssetRowIds,
        finalClaimAssetSets: command.finalClaimAssetSets,
        verificationEvents: verificationReferences,`,
  'backend event final sets',
);
replaceOnce(
  backendPath,
  `      for (const item of command.items) {
        const rowId =
          item.operation === 'insert_claim_asset'
            ? (item.plannedClaimAssetRowId as string)
            : (item.existingClaimAssetRowId as string);
        statements.push(
          database.select({
            guard: sql<number>\`1 / case when exists (
              select 1 from \${claimAssets}
              where \${claimAssets.id} = \${rowId}
                and \${claimAssets.claimId} = \${item.targetClaimId}
                and \${claimAssets.assetId} = \${item.asset.id}
                and \${claimAssets.networkId} = \${item.network.id}
                and \${claimAssets.paymentMethodId} = \${item.paymentMethod.id}
                and \${claimAssets.contractAddress} is not distinct from \${item.proposal.contractAddress}
                and \${claimAssets.isPrimary} = \${item.isPrimary}
                and \${claimAssets.notes} is null
            ) then 1 else 0 end\`,
          }),
        );
      }
      statements.push(`,
  `      for (const item of command.items) {
        const rowId =
          item.operation === 'insert_claim_asset'
            ? (item.plannedClaimAssetRowId as string)
            : (item.existingClaimAssetRowId as string);
        const insertedRowGuard =
          item.operation === 'insert_claim_asset'
            ? sql\`and \${claimAssets.notes} is null
                and \${claimAssets.createdAt} = \${command.appliedAt}
                and \${claimAssets.updatedAt} = \${command.appliedAt}\`
            : sql\`\`;
        statements.push(
          database.select({
            guard: sql<number>\`1 / case when exists (
              select 1 from \${claimAssets}
              where \${claimAssets.id} = \${rowId}
                and \${claimAssets.claimId} = \${item.targetClaimId}
                and \${claimAssets.assetId} = \${item.asset.id}
                and \${claimAssets.networkId} = \${item.network.id}
                and \${claimAssets.paymentMethodId} = \${item.paymentMethod.id}
                and \${claimAssets.contractAddress} is not distinct from \${item.proposal.contractAddress}
                and \${claimAssets.isPrimary} = \${item.isPrimary}
                \${insertedRowGuard}
            ) then 1 else 0 end\`,
          }),
        );
      }
      for (const finalSet of command.finalClaimAssetSets) {
        const expectedRowIds = JSON.stringify(finalSet.rowIds);
        statements.push(
          database.select({
            guard: sql<number>\`1 / case when (
              select coalesce(
                jsonb_agg(final_row.id::text order by final_row.id),
                '[]'::jsonb
              )
              from \${claimAssets} final_row
              where final_row.claim_id = \${finalSet.claimId}
            ) = cast(\${expectedRowIds} as jsonb) then 1 else 0 end\`,
          }),
        );
      }
      statements.push(`,
  'backend exact final row sets',
);

const testPath = 'tests/business-claim-payment-application.test.ts';
replaceOnce(
  testPath,
  `    notes: null,
    createdAt,`,
  `    notes: 'Existing row note.',
    createdAt,`,
  'existing row private note fixture',
);
replaceOnce(
  testPath,
  `      alreadyPresentClaimAssetRowIds: command.items
        .filter((item) => item.operation === 'already_present')
        .map((item) => item.existingClaimAssetRowId as string)
        .sort(),
      verificationEvents: command.verificationEvents`,
  `      alreadyPresentClaimAssetRowIds: command.items
        .filter((item) => item.operation === 'already_present')
        .map((item) => item.existingClaimAssetRowId as string)
        .sort(),
      finalClaimAssetSets: command.finalClaimAssetSets,
      verificationEvents: command.verificationEvents`,
  'test Store final sets',
);
replaceOnce(
  testPath,
  `    expect(store.state.rows).toHaveLength(1);
    expect(store.state.provenanceLinks).toContainEqual(`,
  `    expect(store.state.rows).toHaveLength(1);
    expect(store.state.rows[0]?.notes).toBe('Existing row note.');
    expect(store.state.provenanceLinks).toContainEqual(`,
  'preserved note assertion',
);
replaceOnce(
  testPath,
  `  it('fails closed when a planned candidate Claim has multiple primary rows', async () => {`,
  `  it('rejects lifecycle recovery when an unexpected Claim Asset row appears', async () => {
    const payload = await existingPlan('insert_claim_asset');
    const store = new Store(baseState(payload, [existingClaim()], []));
    store.failLifecycleOnce = true;
    await expect(
      applyBusinessClaimPaymentApplication(
        context,
        store,
        applicationId,
        sourceId,
        request(),
        appliedAt,
      ),
    ).rejects.toMatchObject({ code: 'backend_failure' });
    store.state.rows.push({
      ...row(
        'd0000000-0000-4000-8000-000000000001',
        existingClaimId,
        secondAssetId,
        false,
        appliedAt.toISOString(),
      ),
      notes: null,
    });
    await expect(
      applyBusinessClaimPaymentApplication(
        context,
        store,
        applicationId,
        sourceId,
        request(),
        appliedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(store.canonicalCommits).toBe(1);
  });

  it('fails closed when a planned candidate Claim has multiple primary rows', async () => {`,
  'unexpected row recovery test',
);

const auditPath = 'scripts/check-business-claim-payment-application.mjs';
replaceOnce(
  auditPath,
  `    'expectedDraftSetHash',
  ],`,
  `    'expectedDraftSetHash',
    'finalClaimAssetSets',
  ],`,
  'audit final sets contract',
);
replaceOnce(
  auditPath,
  `    'verifyCanonicalReplayState',
    'transitionSubmissionApplicationLifecycle',`,
  `    'verifyCanonicalReplayState',
    'deriveFinalClaimAssetSets',
    'unexpected or missing Claim Asset row',
    'transitionSubmissionApplicationLifecycle',`,
  'audit final sets service',
);
