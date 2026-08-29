from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    if old not in text:
        raise SystemExit(f"missing patch anchor in {path}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, count))


replace(
    "src/db/schema/source-provenance.ts",
    "    rawPayload: jsonb('raw_payload').notNull(),\n    observedAt: timestamp('observed_at', { withTimezone: true }),",
    "    rawPayload: jsonb('raw_payload').notNull(),\n    officialDomain: varchar('official_domain', { length: 253 }),\n    observedAt: timestamp('observed_at', { withTimezone: true }),",
)
replace(
    "src/db/schema/source-provenance.ts",
    "    index('source_records_source_fetched_idx').on(table.sourceId, table.fetchedAt),\n    index('source_records_content_hash_idx').on(table.contentHash),",
    "    index('source_records_source_fetched_idx').on(table.sourceId, table.fetchedAt),\n    index('source_records_official_domain_idx').on(table.officialDomain),\n    index('source_records_content_hash_idx').on(table.contentHash),",
)
replace(
    "src/db/schema/source-provenance.ts",
    "    check(\n      'source_records_source_url_nonempty',\n      sql`${table.sourceUrl} is null or length(trim(${table.sourceUrl})) > 0`,\n    ),",
    "    check(\n      'source_records_source_url_nonempty',\n      sql`${table.sourceUrl} is null or length(trim(${table.sourceUrl})) > 0`,\n    ),\n    check(\n      'source_records_official_domain_nonempty',\n      sql`${table.officialDomain} is null or length(trim(${table.officialDomain})) > 0`,\n    ),",
)

replace(
    "src/importers/candidate-ingestion-persistence.ts",
    "  rawPayload: NewSourceRecord['rawPayload'];\n  observedAt: Date | null;",
    "  rawPayload: NewSourceRecord['rawPayload'];\n  officialDomain: string | null;\n  observedAt: Date | null;",
)
replace(
    "src/importers/candidate-ingestion-persistence.ts",
    "              rawPayload: refresh.rawPayload,\n              observedAt: refresh.observedAt,",
    "              rawPayload: refresh.rawPayload,\n              officialDomain: refresh.officialDomain,\n              observedAt: refresh.observedAt,",
)

path = "src/importers/osm-overpass-candidate-acquisition.ts"
replace(
    path,
    "      rawPayload: sourceRecord.rawPayload,\n      observedAt: sourceRecord.observedAt ?? null,",
    "      rawPayload: sourceRecord.rawPayload,\n      officialDomain: sourceRecord.officialDomain ?? null,\n      observedAt: sourceRecord.observedAt ?? null,",
)
replace(
    path,
    "      },\n      observedAt: input.fetchedAt,\n      publishedAt: null,",
    "      },\n      officialDomain: officialDomain(tags.website ?? tags['contact:website'] ?? null),\n      observedAt: input.fetchedAt,\n      publishedAt: null,",
)
replace(
    path,
    "  contentHash: string | null;\n  rawPayload: unknown;\n}",
    "  contentHash: string | null;\n  officialDomain: string | null;\n  rawPayload: unknown;\n}",
)
replace(
    path,
    "    officialDomain: seed.officialDomain,\n  };",
    "    officialDomain: row.officialDomain ?? seed.officialDomain,\n  };",
)
replace(
    path,
    "  normalizedNames: readonly string[],\n): Promise<DuplicateAwareExistingCandidateSnapshot[]> {",
    "  normalizedNames: readonly string[],\n  officialDomains: readonly string[],\n): Promise<DuplicateAwareExistingCandidateSnapshot[]> {",
)
replace(
    path,
    "            contentHash: sourceRecords.contentHash,\n            rawPayload: sourceRecords.rawPayload,",
    "            contentHash: sourceRecords.contentHash,\n            officialDomain: sourceRecords.officialDomain,\n            rawPayload: sourceRecords.rawPayload,",
    2,
)
anchor = """  if (sameNameRows.length > MAX_EXISTING_COMPARISONS) {
    throw new CandidateIngestionPersistenceError(
      'conflict',
      `OSM duplicate comparison exceeded the bounded ${MAX_EXISTING_COMPARISONS}-row limit.`,
    );
  }

  const snapshots = new Map<string, DuplicateAwareExistingCandidateSnapshot>();
  for (const row of sameNameRows as ExistingCandidateRow[]) {
    const snapshot = snapshotFromRow(row);
    if (snapshot !== null && !snapshots.has(snapshot.candidateId)) {
      snapshots.set(snapshot.candidateId, snapshot);
    }
  }
"""
replacement = """  const sameDomainRows =
    officialDomains.length === 0
      ? []
      : await database
          .select({
            candidateId: sourceCandidates.id,
            candidateStatus: sourceCandidates.candidateStatus,
            duplicateGroupId: sourceCandidates.duplicateGroupId,
            normalizedName: sourceCandidates.normalizedName,
            sourceId: sourceRecords.sourceId,
            externalId: sourceRecords.externalId,
            contentHash: sourceRecords.contentHash,
            officialDomain: sourceRecords.officialDomain,
            rawPayload: sourceRecords.rawPayload,
          })
          .from(sourceRecords)
          .innerJoin(
            candidateSourceRecords,
            eq(candidateSourceRecords.sourceRecordId, sourceRecords.id),
          )
          .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
          .where(
            and(
              inArray(sourceRecords.officialDomain, [...officialDomains]),
              inArray(sourceCandidates.candidateStatus, ['new', 'triaged']),
            ),
          )
          .limit(MAX_EXISTING_COMPARISONS + 1);

  if (
    sameNameRows.length > MAX_EXISTING_COMPARISONS ||
    sameDomainRows.length > MAX_EXISTING_COMPARISONS
  ) {
    throw new CandidateIngestionPersistenceError(
      'conflict',
      `OSM duplicate comparison exceeded the bounded ${MAX_EXISTING_COMPARISONS}-row limit.`,
    );
  }

  const snapshots = new Map<string, DuplicateAwareExistingCandidateSnapshot>();
  for (const row of [...sameNameRows, ...sameDomainRows] as ExistingCandidateRow[]) {
    const snapshot = snapshotFromRow(row);
    if (snapshot !== null && !snapshots.has(snapshot.candidateId)) {
      snapshots.set(snapshot.candidateId, snapshot);
      if (snapshots.size > MAX_EXISTING_COMPARISONS) {
        throw new CandidateIngestionPersistenceError(
          'conflict',
          `OSM duplicate comparison exceeded the bounded ${MAX_EXISTING_COMPARISONS}-Candidate limit.`,
        );
      }
    }
  }
"""
replace(path, anchor, replacement)
replace(
    path,
    "  const existing = await loadExistingOsmCandidates(\n    database,\n    input.sourceId,\n    externalIds,\n    normalizedNames,\n  );",
    "  const officialDomains = [\n    ...new Set(\n      input.elements\n        .map((element) =>\n          officialDomain(element.tags?.website ?? element.tags?.['contact:website'] ?? null),\n        )\n        .filter((domain): domain is string => domain !== null),\n    ),\n  ];\n  const existing = await loadExistingOsmCandidates(\n    database,\n    input.sourceId,\n    externalIds,\n    normalizedNames,\n    officialDomains,\n  );",
)

replace(
    "tests/candidate-ingestion-persistence.test.ts",
    "    rawPayload: { type: 'node', id: 1, tags: { phone: '+81-00-0000-0000' } },\n    observedAt:",
    "    rawPayload: { type: 'node', id: 1, tags: { phone: '+81-00-0000-0000' } },\n    officialDomain: 'example.test',\n    observedAt:",
)

test_path = "tests/osm-overpass-candidate-acquisition.test.ts"
replace(
    test_path,
    "    expect(result.plan.sourceRecords[0]?.licenseId).toBe(IDS.licenseId);",
    "    expect(result.plan.sourceRecords[0]?.licenseId).toBe(IDS.licenseId);\n    expect(result.plan.sourceRecords[0]?.officialDomain).toBe('example.test');",
)
replace(
    test_path,
    "              ...exampleElement.tags,\n              phone: '+81-00-0000-0000',",
    "              ...exampleElement.tags,\n              website: 'https://changed.example.test/path',\n              phone: '+81-00-0000-0000',",
)
replace(
    test_path,
    "    expect(result.plan.sourceRefreshes?.[0]?.contentHash).not.toBe(existing.contentHash);",
    "    expect(result.plan.sourceRefreshes?.[0]?.contentHash).not.toBe(existing.contentHash);\n    expect(result.plan.sourceRefreshes?.[0]?.officialDomain).toBe('changed.example.test');",
)
insert_before = "  it('fails closed instead of automatically merging a pre-grouped cross-batch Candidate', async () => {\n"
domain_test = """  it('creates a cross-batch duplicate signal from a shared indexed official domain even when names differ', async () => {
    const existing = {
      ...crossBatchDuplicate(),
      normalizedName: 'different merchant name',
      latitude: 34.5,
      longitude: 135.5,
      officialDomain: 'example.test',
    };
    const result = await createOsmOverpassCandidateAcquisitionPlan(
      {
        ...IDS,
        requestId: '00000000-0000-4000-8000-000000000113',
        importBatchId: '00000000-0000-4000-8000-000000000114',
        fetchedAt: new Date('2026-08-29T02:30:00.000Z'),
        importerVersion: '1.0.0',
        elements: [exampleElement],
      },
      [existing],
    );
    const { signal, assignment } = duplicatePlan(result);

    expect(result.reconciliation.duplicateSignals).toHaveLength(1);
    expect(signal.reason).toBe('shared_official_domain');
    expect(signal.strength).toBe('strong');
    expect(assignment.candidateId).toBe(existing.candidateId);
    expect(result.plan.batch.duplicateSignalCount).toBe(1);
    expect(result.plan.batch.automaticConfirmedCount).toBe(0);
  });

"""
replace(test_path, insert_before, domain_test + insert_before)
