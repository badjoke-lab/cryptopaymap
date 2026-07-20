import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(path, oldText, newText, label) {
  let source = readFileSync(path, 'utf8');
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) throw new Error(`${label} marker is missing.`);
  source = source.replace(oldText, newText);
  writeFileSync(path, source);
}

const servicePath = 'src/admin/submissions/business-claim-payment-application.ts';
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
  `  for (const item of execution.payload.items) {
    const row = exactRow(state, itemRowId(item));
    if (
      row === null ||
      row.claimId !== item.targetClaimId ||
      row.assetId !== item.asset.id ||
      row.networkId !== item.network.id ||
      row.paymentMethodId !== item.paymentMethod.id ||
      row.contractAddress !== item.proposal.contractAddress ||
      row.isPrimary !== item.isPrimary ||
      (item.operation === 'insert_claim_asset' &&
        (row.notes !== null || row.createdAt !== appliedAt || row.updatedAt !== appliedAt))
    ) {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'A canonical Claim Asset row does not match the exact durable plan.',
      );
    }
  }
  if (`,
  `  for (const item of execution.payload.items) {
    const row = exactRow(state, itemRowId(item));
    if (
      row === null ||
      row.claimId !== item.targetClaimId ||
      row.assetId !== item.asset.id ||
      row.networkId !== item.network.id ||
      row.paymentMethodId !== item.paymentMethod.id ||
      row.contractAddress !== item.proposal.contractAddress ||
      row.isPrimary !== item.isPrimary ||
      (item.operation === 'insert_claim_asset' &&
        (row.notes !== null || row.createdAt !== appliedAt || row.updatedAt !== appliedAt))
    ) {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'A canonical Claim Asset row does not match the exact durable plan.',
      );
    }
  }
  const expectedRowIdsByClaim = new Map<string, Set<string>>();
  for (const planned of execution.payload.plannedClaims) {
    expectedRowIdsByClaim.set(planned.claimId, new Set());
  }
  for (const guard of execution.payload.existingClaims) {
    expectedRowIdsByClaim.set(
      guard.claimId,
      new Set(guard.expectedRows.map((row) => row.rowId)),
    );
  }
  for (const item of execution.payload.items) {
    const expected = expectedRowIdsByClaim.get(item.targetClaimId) ?? new Set<string>();
    expected.add(itemRowId(item));
    expectedRowIdsByClaim.set(item.targetClaimId, expected);
  }
  for (const [claimId, expectedIds] of expectedRowIdsByClaim) {
    const actualIds = rowsForClaim(state, claimId)
      .map((row) => row.rowId)
      .sort();
    if (JSON.stringify(actualIds) !== JSON.stringify([...expectedIds].sort())) {
      throw new BusinessClaimPaymentApplicationError(
        'conflict',
        'A canonical Claim contains an unexpected or missing Claim Asset row.',
      );
    }
  }
  if (`,
  'complete Claim Asset replay set',
);

const backendPath = 'src/admin/submissions/drizzle-business-claim-payment-application-backend.ts';
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
      const expectedFinalRowIdsByClaim = new Map<string, Set<string>>();
      for (const planned of command.plannedClaims) {
        expectedFinalRowIdsByClaim.set(planned.claimId, new Set());
      }
      for (const existing of command.expectedExistingClaims) {
        expectedFinalRowIdsByClaim.set(
          existing.claimId,
          new Set(existing.expectedRows.map((row) => row.rowId)),
        );
      }
      for (let index = 0; index < command.items.length; index += 1) {
        const item = command.items[index];
        if (item === undefined) continue;
        const expected = expectedFinalRowIdsByClaim.get(item.targetClaimId) ?? new Set<string>();
        expected.add(itemRowId(command, index));
        expectedFinalRowIdsByClaim.set(item.targetClaimId, expected);
      }
      for (const [claimId, expectedIds] of expectedFinalRowIdsByClaim) {
        statements.push(
          database.select({
            guard: sql<number>\`1 / case when (
              select count(*) from \${claimAssets}
              where \${claimAssets.claimId} = \${claimId}
            ) = \${expectedIds.size} then 1 else 0 end\`,
          }),
        );
      }
      statements.push(`,
  'backend exact row set guard',
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
