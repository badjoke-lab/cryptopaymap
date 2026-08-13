import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const canonicalOrigin = 'https://www.cryptopaymap.com';

function listFiles(root) {
  const files = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stats = statSync(path);
      if (stats.isDirectory()) visit(path);
      else if (stats.isFile()) files.push(path);
    }
  }
  visit(root);
  return files;
}

function htmlFileToRoute(root, path) {
  const file = relative(root, path).replaceAll('\\', '/');
  if (!file.endsWith('.html') || file === '404.html') return null;
  if (file === 'index.html') return '/';
  if (file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`;
  return `/${file}`;
}

export function collectPublicRoutes(root) {
  return listFiles(root)
    .map((path) => htmlFileToRoute(root, path))
    .filter((route) => route !== null)
    .filter((route) => route !== '/404.html' && !route.startsWith('/admin/'))
    .sort();
}

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function ensureOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('production_machine_canonical_origin_invalid');
  }
  return url.origin;
}

export function materializeProductionMachineFiles(root, options = {}) {
  const origin = ensureOrigin(options.canonicalOrigin ?? canonicalOrigin);
  const routes = collectPublicRoutes(root);
  if (!routes.includes('/')) throw new Error('production_machine_home_route_missing');

  const robots = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');

  const llms = [
    '# CryptoPayMap',
    '',
    '> Verified cryptocurrency payment discovery for physical places and online services.',
    '',
    `Canonical: ${origin}/`,
    `Public data manifest: ${origin}/data/manifest.json`,
    `Dataset version: ${origin}/version.json`,
    `Methodology: ${origin}/methodology/`,
    `Sources and licenses: ${origin}/sources-and-licenses/`,
    '',
    'Only reviewed public records belong to the public dataset. Candidate records, private submissions, protected administration data, and credentials are not public data.',
    '',
  ].join('\n');

  const ai = [
    'Project: CryptoPayMap',
    'Purpose: Verified cryptocurrency payment discovery for physical places and online services.',
    `Canonical: ${origin}/`,
    `Public data manifest: ${origin}/data/manifest.json`,
    `Dataset version: ${origin}/version.json`,
    `Robots: ${origin}/robots.txt`,
    `Sitemap: ${origin}/sitemap.xml`,
    'Public data boundary: reviewed public records only.',
    'Non-public boundary: candidates, private submissions, protected administration data, and credentials are excluded.',
    '',
  ].join('\n');

  const urls = routes.map((route) => `${origin}${route === '/' ? '/' : route}`);
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${xmlEscape(url)}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');

  writeFileSync(resolve(root, 'robots.txt'), robots);
  writeFileSync(resolve(root, 'llms.txt'), llms);
  writeFileSync(resolve(root, 'ai.txt'), ai);
  writeFileSync(resolve(root, 'sitemap.xml'), sitemap);

  return { origin, routes, routeCount: routes.length };
}

export function validateProductionMachineFiles(root, options = {}) {
  const origin = ensureOrigin(options.canonicalOrigin ?? canonicalOrigin);
  const robots = readFileSync(resolve(root, 'robots.txt'), 'utf8');
  const llms = readFileSync(resolve(root, 'llms.txt'), 'utf8');
  const ai = readFileSync(resolve(root, 'ai.txt'), 'utf8');
  const sitemap = readFileSync(resolve(root, 'sitemap.xml'), 'utf8');

  if (!robots.includes('User-agent: *') || !robots.includes('Allow: /')) {
    throw new Error('production_robots_indexing_policy_missing');
  }
  if (!robots.includes('Disallow: /admin/')) {
    throw new Error('production_robots_admin_exclusion_missing');
  }
  if (!robots.includes(`Sitemap: ${origin}/sitemap.xml`)) {
    throw new Error('production_robots_sitemap_missing');
  }
  if (!llms.includes('# CryptoPayMap') || !llms.includes(`${origin}/data/manifest.json`)) {
    throw new Error('production_llms_public_contract_invalid');
  }
  if (!ai.includes('Project: CryptoPayMap') || !ai.includes('reviewed public records only')) {
    throw new Error('production_ai_public_contract_invalid');
  }
  if (!sitemap.includes(`<loc>${origin}/</loc>`)) {
    throw new Error('production_sitemap_home_missing');
  }
  if (sitemap.includes('/admin/') || sitemap.includes('/404.html')) {
    throw new Error('production_sitemap_private_or_error_route_present');
  }

  return {
    robots: 'passed',
    llms: 'passed',
    ai: 'passed',
    sitemap: 'passed',
    routeCount: (sitemap.match(/<url>/g) ?? []).length,
  };
}

function assert(value, message) {
  if (!value) throw new Error(`self_test_failed:${message}`);
}

function selfTest() {
  const root = mkdtempSync(resolve(tmpdir(), 'cpm-production-machine-'));
  try {
    mkdirSync(resolve(root, 'about'), { recursive: true });
    mkdirSync(resolve(root, 'admin'), { recursive: true });
    writeFileSync(resolve(root, 'index.html'), '<!doctype html><title>Home</title>');
    writeFileSync(resolve(root, 'about/index.html'), '<!doctype html><title>About</title>');
    writeFileSync(resolve(root, 'admin/index.html'), '<!doctype html><title>Admin</title>');
    writeFileSync(resolve(root, '404.html'), '<!doctype html><title>Not found</title>');

    const first = materializeProductionMachineFiles(root);
    const validation = validateProductionMachineFiles(root);
    assert(first.routes.join(',') === '/,/about/', 'only public HTML routes must enter sitemap');
    assert(validation.routeCount === 2, 'sitemap route count must be deterministic');
    assert(
      !readFileSync(resolve(root, 'sitemap.xml'), 'utf8').includes('/admin/'),
      'admin excluded',
    );

    const before = [
      readFileSync(resolve(root, 'robots.txt'), 'utf8'),
      readFileSync(resolve(root, 'llms.txt'), 'utf8'),
      readFileSync(resolve(root, 'ai.txt'), 'utf8'),
      readFileSync(resolve(root, 'sitemap.xml'), 'utf8'),
    ].join('\n--FILE--\n');
    materializeProductionMachineFiles(root);
    const after = [
      readFileSync(resolve(root, 'robots.txt'), 'utf8'),
      readFileSync(resolve(root, 'llms.txt'), 'utf8'),
      readFileSync(resolve(root, 'ai.txt'), 'utf8'),
      readFileSync(resolve(root, 'sitemap.xml'), 'utf8'),
    ].join('\n--FILE--\n');
    assert(before === after, 'machine files must be deterministic');
    console.log('OPS-P6-021 production machine files self-test passed.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const [root] = process.argv.slice(2);
  if (!root) throw new Error('Usage: materialize-production-machine-files <dist-root>');
  const result = materializeProductionMachineFiles(resolve(root));
  validateProductionMachineFiles(resolve(root));
  console.log(`Production machine files materialized for ${result.routeCount} public routes.`);
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) await main();
