import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';

const sourceUrl = new URL(
  '../drizzle/snapshot-artifacts/0020_snapshot.json.br.hex.part01',
  import.meta.url,
);
const targetUrl = new URL('../drizzle/meta/0020_snapshot.json', import.meta.url);
const expected = '59edb250b4885049be03f489164c7afd5c93d1e9b9484b44e3c00712efca7d3e';
const encoded = await readFile(sourceUrl, 'utf8');
const snapshot = brotliDecompressSync(Buffer.from(encoded.trim(), 'hex'));
const actual = createHash('sha256').update(snapshot).digest('hex');

if (actual !== expected) {
  throw new Error('Drizzle snapshot hash mismatch for 0020_chief_warbound.');
}

JSON.parse(snapshot.toString('utf8'));
await writeFile(targetUrl, snapshot);
console.log('Materialized Drizzle snapshot 0020_chief_warbound.');
