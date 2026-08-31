from pathlib import Path

path = Path('scripts/crawl-official-payment-evidence-batch.ts')
text = path.read_text()
needle = '''  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(
'''
insert = '''  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const attemptFetchedAt = new Date();
  const attemptExternalIds = targets.map(
    (target) => `candidate:${target.candidateId}:official-payment-crawl-attempt:v2`,
  );
  if (attemptExternalIds.length > 0) {
    await db
      .insert(sourceRecords)
      .values(
        targets.map((target) => ({
          sourceId: resolvedSourceId,
          externalId: `candidate:${target.candidateId}:official-payment-crawl-attempt:v2`,
          sourceUrl: target.url.toString(),
          rawPayload: {
            discovery: 'official_payment_crawl_attempt',
            discoveryVersion: 'official-payment-crawl-v2',
            candidateId: target.candidateId,
          },
          officialDomain: target.officialDomain,
          observedAt: attemptFetchedAt,
          fetchedAt: attemptFetchedAt,
        })),
      )
      .onConflictDoNothing();

    const attemptRows = await db
      .select({ id: sourceRecords.id, externalId: sourceRecords.externalId })
      .from(sourceRecords)
      .where(
        and(
          eq(sourceRecords.sourceId, resolvedSourceId),
          inArray(sourceRecords.externalId, attemptExternalIds),
        ),
      );
    const candidateIdByAttemptExternalId = new Map(
      targets.map((target) => [
        `candidate:${target.candidateId}:official-payment-crawl-attempt:v2`,
        target.candidateId,
      ]),
    );
    const attemptLinks = attemptRows.flatMap((row) => {
      const candidateId = row.externalId
        ? candidateIdByAttemptExternalId.get(row.externalId)
        : undefined;
      return candidateId
        ? [{ candidateId, sourceRecordId: row.id, relationship: 'supporting' as const }]
        : [];
    });
    if (attemptLinks.length > 0) {
      await db.insert(candidateSourceRecords).values(attemptLinks).onConflictDoNothing();
    }
    counters.attemptMarkersPersisted = attemptLinks.length;
  }

  console.log(
'''
if needle not in text:
    raise SystemExit('worker completion marker missing')
text = text.replace(needle, insert, 1)
needle = '''    automaticConfirmedCount: 0,
  };
'''
replacement = '''    automaticConfirmedCount: 0,
    attemptMarkersPersisted: 0,
  };
'''
if needle not in text:
    raise SystemExit('counter marker missing')
text = text.replace(needle, replacement, 1)
path.write_text(text)
