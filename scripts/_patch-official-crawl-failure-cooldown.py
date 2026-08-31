from pathlib import Path

selector = Path('scripts/crawl-next-official-payment-evidence-batch.ts')
text = selector.read_text()
text = text.replace(
    "const SCAN_LIMIT = 20_000;\n",
    "const SCAN_LIMIT = 20_000;\nconst FAILURE_RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1_000;\n",
)
old = "  const [originRows, existingEvidenceRows, attemptedRows] = await Promise.all(["
new = "  const [originRows, existingEvidenceRows, attemptedRows, failureRows] = await Promise.all(["
if old not in text:
    raise SystemExit('selector Promise.all anchor missing')
text = text.replace(old, new, 1)
old = """    db
      .select({ candidateId: candidateSourceRecords.candidateId })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(like(sourceRecords.externalId, 'candidate:%:official-payment-crawl-attempt:v2')),
  ]);

  const candidatesWithOfficialEvidence = new Set(
"""
new = """    db
      .select({ candidateId: candidateSourceRecords.candidateId })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(like(sourceRecords.externalId, 'candidate:%:official-payment-crawl-attempt:v2')),
    db
      .select({
        candidateId: candidateSourceRecords.candidateId,
        fetchedAt: sourceRecords.fetchedAt,
      })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(like(sourceRecords.externalId, 'candidate:%:official-payment-crawl-failure:v3:%')),
  ]);

  const candidatesWithOfficialEvidence = new Set(
"""
if old not in text:
    raise SystemExit('selector attemptedRows anchor missing')
text = text.replace(old, new, 1)
old = """  const attemptedCandidates = new Set(attemptedRows.map((row) => row.candidateId));
  const eligible = originRows.filter(
"""
new = """  const attemptedCandidates = new Set(attemptedRows.map((row) => row.candidateId));
  const now = Date.now();
  const recentFailureCandidates = new Set(
    failureRows
      .filter(
        (row) =>
          row.fetchedAt !== null && now - row.fetchedAt.getTime() < FAILURE_RETRY_COOLDOWN_MS,
      )
      .map((row) => row.candidateId),
  );
  const eligible = originRows.filter(
"""
if old not in text:
    raise SystemExit('selector failure set anchor missing')
text = text.replace(old, new, 1)
old = """      !candidatesWithOfficialEvidence.has(row.candidateId) &&
      !attemptedCandidates.has(row.candidateId) &&
      candidatePartition(row.candidateId, partition.count) === partition.index,
"""
new = """      !candidatesWithOfficialEvidence.has(row.candidateId) &&
      !attemptedCandidates.has(row.candidateId) &&
      !recentFailureCandidates.has(row.candidateId) &&
      candidatePartition(row.candidateId, partition.count) === partition.index,
"""
if old not in text:
    raise SystemExit('selector eligible anchor missing')
text = text.replace(old, new, 1)
text = text.replace(
    "        attemptedCandidates: attemptedCandidates.size,\n        eligibleWithoutOfficialEvidence: eligible.length,\n",
    "        attemptedCandidates: attemptedCandidates.size,\n        recentFailureCooldownCandidates: recentFailureCandidates.size,\n        eligibleWithoutOfficialEvidence: eligible.length,\n",
)
text = text.replace(
    "      attemptedCandidates: attemptedCandidates.size,\n      eligibleWithoutOfficialEvidence: eligible.length,\n",
    "      attemptedCandidates: attemptedCandidates.size,\n      recentFailureCooldownCandidates: recentFailureCandidates.size,\n      eligibleWithoutOfficialEvidence: eligible.length,\n",
)
selector.write_text(text)

crawler = Path('scripts/crawl-official-payment-evidence-batch.ts')
text = crawler.read_text()
old = """    automaticConfirmedCount: 0,
    attemptMarkersPersisted: 0,
  };
"""
new = """    automaticConfirmedCount: 0,
    attemptMarkersPersisted: 0,
    failureMarkersPersisted: 0,
  };
"""
if old not in text:
    raise SystemExit('crawler counter anchor missing')
text = text.replace(old, new, 1)
old = """    counters.attemptMarkersPersisted = attemptLinks.length;
  }

  console.log(
"""
new = """    counters.attemptMarkersPersisted = attemptLinks.length;
  }

  const failedTargets = targets.filter(
    (target) => !completedCrawlCandidateIds.has(target.candidateId),
  );
  if (failedTargets.length > 0) {
    const retryAfter = new Date(attemptFetchedAt.getTime() + 6 * 60 * 60 * 1_000);
    const failureBucket = attemptFetchedAt.toISOString().slice(0, 13).replace(/[-T:]/g, '');
    const failureExternalIds = failedTargets.map(
      (target) =>
        `candidate:${target.candidateId}:official-payment-crawl-failure:v3:${failureBucket}`,
    );
    await db
      .insert(sourceRecords)
      .values(
        failedTargets.map((target) => ({
          sourceId: resolvedSourceId,
          externalId: `candidate:${target.candidateId}:official-payment-crawl-failure:v3:${failureBucket}`,
          sourceUrl: target.url.toString(),
          rawPayload: {
            discovery: 'official_payment_crawl_failure',
            discoveryVersion: 'official-payment-crawl-failure-v3',
            candidateId: target.candidateId,
            retryAfter: retryAfter.toISOString(),
          },
          officialDomain: target.officialDomain,
          observedAt: attemptFetchedAt,
          fetchedAt: attemptFetchedAt,
        })),
      )
      .onConflictDoNothing();

    const failureRows = await db
      .select({ id: sourceRecords.id, externalId: sourceRecords.externalId })
      .from(sourceRecords)
      .where(
        and(
          eq(sourceRecords.sourceId, resolvedSourceId),
          inArray(sourceRecords.externalId, failureExternalIds),
        ),
      );
    const candidateIdByFailureExternalId = new Map(
      failedTargets.map((target) => [
        `candidate:${target.candidateId}:official-payment-crawl-failure:v3:${failureBucket}`,
        target.candidateId,
      ]),
    );
    const failureLinks = failureRows.flatMap((row) => {
      const candidateId = row.externalId
        ? candidateIdByFailureExternalId.get(row.externalId)
        : undefined;
      return candidateId
        ? [{ candidateId, sourceRecordId: row.id, relationship: 'supporting' as const }]
        : [];
    });
    if (failureLinks.length > 0) {
      await db.insert(candidateSourceRecords).values(failureLinks).onConflictDoNothing();
    }
    counters.failureMarkersPersisted = failureLinks.length;
  }

  console.log(
"""
if old not in text:
    raise SystemExit('crawler persistence anchor missing')
text = text.replace(old, new, 1)
crawler.write_text(text)
