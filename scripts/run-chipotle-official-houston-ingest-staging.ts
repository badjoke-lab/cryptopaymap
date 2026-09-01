import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const sourceUrl = new URL('./ingest-chipotle-official-houston-physical-candidates-staging.ts', import.meta.url);
const runtimeUrl = new URL('./.runtime-ingest-chipotle-official-houston-physical-candidates-staging.ts', import.meta.url);
const source = readFileSync(sourceUrl, 'utf8');
const needle = 'inputCount: discovered.length, acceptedCount: fresh.length';
const replacement = 'inputCount: discovered.length + detailFetchFailures + addressParseFailures + geocodeFailures, acceptedCount: fresh.length';
if (!source.includes(needle)) throw new Error('Houston importer count patch target changed unexpectedly.');
writeFileSync(runtimeUrl, source.replace(needle, replacement), 'utf8');
try {
  await import(`./.runtime-ingest-chipotle-official-houston-physical-candidates-staging.ts?run=${Date.now()}`);
} finally {
  try { unlinkSync(runtimeUrl); } catch {}
}
