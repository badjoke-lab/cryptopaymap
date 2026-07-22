import { readFileSync, writeFileSync } from 'node:fs';

function replaceAll(path, replacements) {
  let source = readFileSync(path, 'utf8');
  for (const [before, after] of replacements) {
    if (!source.includes(before) && !source.includes(after)) {
      throw new Error(`${path}: marker missing: ${before}`);
    }
    source = source.replaceAll(before, after);
  }
  writeFileSync(path, source);
}

replaceAll('src/admin/submissions/private-retention-contract.ts', [
  ['effectiveAt: x.iso.datetime', 'effectiveAt: z.iso.datetime'],
  ['deletedObjectCount: x.number()', 'deletedObjectCount: z.number()'],
  ['export type PrivateRetentionRunReceipt = x.infer', 'export type PrivateRetentionRunReceipt = z.infer'],
]);

replaceAll('src/submissions/private-media-retention.ts', [
  ['deletedObjectCount: x.number()', 'deletedObjectCount: z.number()'],
  ['missingObjectCount: x.number()', 'missingObjectCount: z.number()'],
]);

replaceAll('src/submissions/drizzle-private-media-retention.ts', [
  ['const result = x.uuid().safeParse', 'const result = z.uuid().safeParse'],
]);

replaceAll('src/admin/submissions/private-retention.ts', [
  ["case 'closed_submission_without_handof':", "case 'closed_submission_without_handoff':"],
  ['if (!inputResult.success || Number.isNaN(startedAt.getTime()) {', 'if (!inputResult.success || Number.isNaN(startedAt.getTime())) {'],
  ['        runId: validContext.runId,\n      actorId: validContext.actorId,', '        runId: validContext.runId,\n        actorId: validContext.actorId,'],
]);

const indexPath = 'src/db/schema/index.ts';
let index = readFileSync(indexPath, 'utf8');
const exportLine = "export * from './submission-retention';";
if (!index.includes(exportLine)) {
  const marker = "export * from './submission-applications';";
  if (!index.includes(marker)) throw new Error('Schema index marker is missing.');
  index = index.replace(marker, `${marker}\n${exportLine}`);
  writeFileSync(indexPath, index);
}
