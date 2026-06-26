import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const requiredFiles = [
  'AGENTS.md',
  'astro.config.mjs',
  'biome.json',
  'drizzle.config.ts',
  'package.json',
  'wrangler.jsonc',
  '.github/workflows/p1-01-validate.yml',
  '.github/workflows/staging-deploy.yml',
  'content/roadmap.yml',
  'docs/ACCESSIBILITY.md',
  'docs/CLOUDFLARE_STAGING.md',
  'docs/DATABASE_FOUNDATION.md',
  'docs/DESIGN_SYSTEM.md',
  'docs/IMPLEMENTATION_PLAN.md',
  'docs/MOTION_SYSTEM.md',
  'docs/PROJECT_STATUS.md',
  'docs/PWA.md',
  'docs/STATE_MANAGEMENT.md',
  'docs/TESTING.md',
  'docs/UI_PRIMITIVES.md',
  'public/_headers',
  'public/manifest.webmanifest',
  'scripts/check-accessibility-foundation.mjs',
  'scripts/check-staging-artifact.mjs',
  'src/components/ui/Button.tsx',
  'src/components/ui/Dialog.tsx',
  'src/components/ui/Field.tsx',
  'src/components/ui/SelectField.tsx',
  'src/components/ui/Sheet.tsx',
  'src/content.config.ts',
  'src/layouts/BaseLayout.astro',
  'src/pages/changelog.astro',
  'src/pages/roadmap.astro',
];

for (const path of requiredFiles) {
  if (!existsSync(path)) {
    throw new Error(`Missing Phase 1 foundation file: ${path}`);
  }
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const requiredScripts = [
  'build',
  'check',
  'format:check',
  'lint',
  'test',
  'schema:check',
  'db:check',
  'accessibility:check',
  'staging:check',
  'quality',
];

for (const script of requiredScripts) {
  if (typeof packageJson.scripts?.[script] !== 'string') {
    throw new Error(`Missing Phase 1 package script: ${script}`);
  }
}

const requiredDependencies = [
  '@astrojs/react',
  '@neondatabase/serverless',
  '@tanstack/react-query',
  'astro',
  'drizzle-orm',
  'motion',
  'radix-ui',
  'react',
  'react-dom',
  'zod',
  'zustand',
];

for (const dependency of requiredDependencies) {
  if (typeof packageJson.dependencies?.[dependency] !== 'string') {
    throw new Error(`Missing pinned Phase 1 dependency: ${dependency}`);
  }
}

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
if (manifest.display !== 'standalone' || manifest.start_url !== '/' || manifest.scope !== '/') {
  throw new Error('PWA manifest does not preserve the Phase 1 installability contract.');
}

const layout = readFileSync('src/layouts/BaseLayout.astro', 'utf8');
const requiredLayoutFragments = [
  'href="/manifest.webmanifest"',
  'href="#main-content"',
  'id="main-content"',
  'tabindex="-1"',
  '<ClientRouter',
];
for (const fragment of requiredLayoutFragments) {
  if (!layout.includes(fragment)) {
    throw new Error(`Shared layout is missing Phase 1 contract fragment: ${fragment}`);
  }
}

const contentConfig = readFileSync('src/content.config.ts', 'utf8');
if (!contentConfig.includes("file('content/roadmap.yml')")) {
  throw new Error('Roadmap collection is not connected to its structured public source.');
}
if (!contentConfig.includes("base: './content/changelog'")) {
  throw new Error('Changelog collection is not connected to its release source directory.');
}

const stagingWorkflow = readFileSync('.github/workflows/staging-deploy.yml', 'utf8');
const requiredStagingFragments = [
  'workflow_dispatch:',
  'environment: staging',
  'secrets.CLOUDFLARE_API_TOKEN',
  'secrets.CLOUDFLARE_ACCOUNT_ID',
  'cryptopaymap-staging',
];
for (const fragment of requiredStagingFragments) {
  if (!stagingWorkflow.includes(fragment)) {
    throw new Error(`Staging workflow is missing required boundary: ${fragment}`);
  }
}

const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const forbiddenInternalMarkers = [
  'CRYPTOPAYMAP_INTERNAL_PROJECT_POLICY_CANVAS',
  'CRYPTOPAYMAP_INTERNAL_MASTER_SPEC',
  'CRYPTOPAYMAP_INTERNAL_ROADMAP',
  'CRYPTOPAYMAP_INTERNAL_DECISION_LOG',
];
const textExtensions = new Set([
  '.astro',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsonc',
  '.md',
  '.mjs',
  '.sql',
  '.ts',
  '.tsx',
  '.txt',
  '.webmanifest',
  '.yml',
  '.yaml',
]);

for (const path of trackedFiles) {
  const extension = path.includes('.') ? `.${path.split('.').pop()}` : '';
  if (!textExtensions.has(extension) || !existsSync(path)) continue;

  const content = readFileSync(path, 'utf8');
  for (const marker of forbiddenInternalMarkers) {
    if (path.includes(marker) || content.includes(marker)) {
      throw new Error(`Internal-only project marker found in tracked public content: ${path}`);
    }
  }
}

const requiredArtifactFiles = [
  'dist/index.html',
  'dist/roadmap/index.html',
  'dist/changelog/index.html',
  'dist/manifest.webmanifest',
  'dist/_headers',
];
for (const path of requiredArtifactFiles) {
  if (!existsSync(path)) {
    throw new Error(`Missing integrated Phase 1 build artifact: ${path}`);
  }
}

console.log('Phase 1 foundation audit checks passed.');
