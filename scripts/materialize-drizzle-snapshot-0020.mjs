import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';

const files = [
  '0020_snapshot.json.br.b64.part01',
  '0020_snapshot.json.br.b64.part02',
  '0020_snapshot.json.br.b64.part03',
  '0020_snapshot.json.br.b64.part04',
  '0020_snapshot.json.br.b64.part05',
  '0020_snapshot.json.br.b64.part06',
  '0020_snapshot.json.br.b64.part07',
];
const parts = [];
for (const file of files) {
  const encoded = await readFile(
    new URL(`../drizzle/snapshot-artifacts/${file}`, import.meta.url),
    'utf8',
  );
  parts.push(Buffer.from(encoded.trim(), 'base64'));
}

const target = new URL('../drizzle/meta/0020_snapshot.json', import.meta.url);
const expected = '59edb250b4885049be03f489164c7afd5c93d1e9b9484b44e3c00712efca7d3e';
const snapshot = brotliDecompressSync(Buffer.concat(parts));
const actual = createHash('sha256').update(snapshot).digest('hex');
if (actual !== expected) throw new Error('Snapshot hash mismatch for 0020.');
JSON.parse(snapshot.toString('utf8'));
await writeFile(target, snapshot);
console.log('Materialized Drizzle snapshot 0020.');
