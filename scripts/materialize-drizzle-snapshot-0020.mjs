import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';

const root = '../drizzle/snapshot-artifacts/';
const files = [
  '0020_snapshot.json.br.hex.part01',
  '0020_snapshot.json.br.hex.part02',
  '0020_snapshot.json.br.hex.part03a',
  '0020_snapshot.json.br.hex.part03b',
  '0020_snapshot.json.br.hex.part04a',
  '0020_snapshot.json.br.hex.part04b',
  '0020_snapshot.json.br.hex.part05a',
  '0020_snapshot.json.br.hex.part05b',
  '0020_snapshot.json.br.hex.part06a',
  '0020_snapshot.json.br.hex.part06b',
  '0020_snapshot.json.br.hex.part07a',
  '0020_snapshot.json.br.hex.part07b',
  '0020_snapshot.json.br.hex.part08a',
  '0020_snapshot.json.br.hex.part08b',
];
const parts = [];
for (const file of files) {
  parts.push(await readFile(new URL(root + file, import.meta.url), 'utf8'));
}
const target = new URL('../drizzle/meta/0020_snapshot.json', import.meta.url);
const expected = '59edb250b4885049be03f489164c7afd5c93d1e9b9484b44e3c00712efca7d3e';
const snapshot = brotliDecompressSync(Buffer.from(parts.join('').trim(), 'hex'));
const actual = createHash('sha256').update(snapshot).digest('hex');
if (actual !== expected) throw new Error('Snapshot hash mismatch for 0020.');
JSON.parse(snapshot.toString('utf8'));
await writeFile(target, snapshot);
console.log('Materialized Drizzle snapshot 0020.');
