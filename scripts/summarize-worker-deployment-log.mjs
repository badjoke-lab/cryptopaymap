import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ansiPattern = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const longTokenPattern = /\b[A-Za-z0-9_-]{32,}\b/g;
const urlCredentialPattern = /(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi;
const authorizationPattern = /(authorization\s*:\s*)(.+)$/i;
const diagnosticPattern =
  /(error|code|permission|authoriz|forbidden|authentication|durable object|workers? api|workers\.api|not allowed|requires|failed)/i;

function sanitizeLine(line) {
  return line
    .replace(ansiPattern, '')
    .replace(urlCredentialPattern, '$1<redacted>@')
    .replace(authorizationPattern, '$1<redacted>')
    .replace(longTokenPattern, '<redacted-token>')
    .trim()
    .slice(0, 320);
}

export function summarizeWorkerDeploymentLog(rawLog) {
  const sanitizedLines = rawLog
    .split(/\r?\n/)
    .map(sanitizeLine)
    .filter(Boolean);
  const preferred = sanitizedLines.filter((line) => diagnosticPattern.test(line));
  const source = preferred.length > 0 ? preferred : sanitizedLines.slice(-12);
  return Object.freeze({
    lines: source.slice(-12),
  });
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    throw new Error('Input and output paths are required.');
  }
  const summary = summarizeWorkerDeploymentLog(readFileSync(inputPath, 'utf8'));
  writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
  console.log('Worker deployment diagnostic summary prepared.');
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) {
  main();
}
