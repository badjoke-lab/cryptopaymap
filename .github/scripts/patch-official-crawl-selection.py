from pathlib import Path

path = Path('scripts/crawl-official-payment-evidence-batch.ts')
text = path.read_text()
text = text.replace('const MAX_BATCH_IDS = 20;', 'const MAX_BATCH_IDS = 50;\nconst MAX_CANDIDATE_IDS = 250;', 1)

needle = '''function maxTargetsFromEnvironment(): number {
'''
insert = '''function candidateIdsFromEnvironment(): string[] | null {
  const raw = process.env.CPM_OFFICIAL_EVIDENCE_CANDIDATE_IDS?.trim() ?? '';
  if (!raw) return null;
  const ids = [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))];
  if (ids.length === 0 || ids.length > MAX_CANDIDATE_IDS) {
    throw new Error(`CPM_OFFICIAL_EVIDENCE_CANDIDATE_IDS must contain 1-${MAX_CANDIDATE_IDS} UUIDs.`);
  }
  if (ids.some((id) => !UUID_PATTERN.test(id))) {
    throw new Error('Every official Evidence Candidate ID must be a UUID.');
  }
  return ids;
}

'''
if needle not in text:
    raise SystemExit('max targets marker missing')
text = text.replace(needle, insert + needle, 1)

old = '''  const batchIds = batchIdsFromEnvironment();
  const maxTargets = maxTargetsFromEnvironment();
  const db = createDatabase(databaseUrl);
'''
new = '''  const batchIds = batchIdsFromEnvironment();
  const candidateIds = candidateIdsFromEnvironment();
  const maxTargets = maxTargetsFromEnvironment();
  const db = createDatabase(databaseUrl);
'''
if old not in text:
    raise SystemExit('main env block missing')
text = text.replace(old, new, 1)

old = '''  const eligibleTargets = candidateRows
    .filter((row) => row.duplicateGroupId === null && row.officialDomain !== null)
'''
new = '''  const candidateIdSet = candidateIds === null ? null : new Set(candidateIds);
  const eligibleTargets = candidateRows
    .filter(
      (row) =>
        (candidateIdSet === null || candidateIdSet.has(row.candidateId)) &&
        row.duplicateGroupId === null &&
        row.officialDomain !== null,
    )
'''
if old not in text:
    raise SystemExit('eligible target block missing')
text = text.replace(old, new, 1)

old = '''      maxTargets,
      maxInternalPagesPerCandidate: MAX_INTERNAL_PAGES,
'''
new = '''      maxTargets,
      exactCandidateSelection: candidateIds !== null,
      maxInternalPagesPerCandidate: MAX_INTERNAL_PAGES,
'''
if old not in text:
    raise SystemExit('output block missing')
text = text.replace(old, new, 1)
path.write_text(text)
