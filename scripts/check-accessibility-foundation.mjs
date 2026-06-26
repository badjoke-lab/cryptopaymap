import { existsSync, readFileSync } from 'node:fs';

const documentPath = 'dist/index.html';

if (!existsSync(documentPath)) {
  throw new Error('Build output is missing dist/index.html. Run the static build first.');
}

const html = readFileSync(documentPath, 'utf8');

function requireMatch(pattern, message) {
  if (!pattern.test(html)) {
    throw new Error(message);
  }
}

requireMatch(/<html\b[^>]*\blang=["']en["']/i, 'The document must declare an English language.');
requireMatch(/<title>\s*[^<]+\s*<\/title>/i, 'The document must include a non-empty title.');
requireMatch(
  /<a\b[^>]*\bclass=["'][^"']*skip-link[^"']*["'][^>]*\bhref=["']#main-content["']/i,
  'The document must expose a skip link to the main landmark.',
);
requireMatch(
  /<main\b[^>]*\bid=["']main-content["'][^>]*\btabindex=["']-1["']/i,
  'The main landmark must be a programmatically focusable skip-link target.',
);
requireMatch(/<nav\b[^>]*\baria-label=["']Primary["']/i, 'Primary navigation needs a label.');
requireMatch(/<nav\b[^>]*\baria-label=["']Footer["']/i, 'Footer navigation needs a label.');

const headingCount = html.match(/<h1\b/gi)?.length ?? 0;
if (headingCount !== 1) {
  throw new Error(`Expected exactly one h1 in the foundation page, found ${headingCount}.`);
}

const ids = [...html.matchAll(/\sid=(["'])(.*?)\1/gi)].map((match) => match[2]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length > 0) {
  throw new Error(`Duplicate document ids found: ${[...new Set(duplicateIds)].join(', ')}`);
}

if (/\btabindex=["'](?:[1-9]\d*)["']/i.test(html)) {
  throw new Error('Positive tabindex values are not allowed.');
}

if (/\bautofocus(?:\s|=|>)/i.test(html)) {
  throw new Error('Autofocus is not allowed in the shared foundation page.');
}

for (const image of html.match(/<img\b[^>]*>/gi) ?? []) {
  if (!/\balt=(["']).*?\1/i.test(image)) {
    throw new Error(`Image is missing an alt attribute: ${image}`);
  }
}

for (const button of html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) ?? []) {
  const openingTag = button.match(/^<button\b[^>]*>/i)?.[0] ?? '';
  const text = button
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const hasExplicitName = /\baria-(?:label|labelledby)=(["']).+?\1/i.test(openingTag);

  if (!hasExplicitName && text.length === 0) {
    throw new Error(`Button is missing an accessible name: ${openingTag}`);
  }
}

for (const input of html.match(/<input\b[^>]*>/gi) ?? []) {
  const id = input.match(/\bid=(["'])(.*?)\1/i)?.[2];
  const hasExplicitName = /\baria-(?:label|labelledby)=(["']).+?\1/i.test(input);
  const hasAssociatedLabel = id
    ? new RegExp(`<label\\b[^>]*\\bfor=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(
        html,
      )
    : false;

  if (!hasExplicitName && !hasAssociatedLabel) {
    throw new Error(`Input is missing an accessible label: ${input}`);
  }
}

console.log('Accessibility foundation checks passed.');
