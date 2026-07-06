// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readRepositoryFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('public content contract', () => {
  it('uses separate Roadmap and Changelog loaders', () => {
    const config = readRepositoryFile('src/content.config.ts');

    expect(config).toContain("file('content/roadmap.yml')");
    expect(config).toContain("base: './content/changelog'");
    expect(config).toContain("section: z.enum(['now', 'next', 'later', 'exploring'])");
  });

  it('contains all public Roadmap sections', () => {
    const roadmap = readRepositoryFile('content/roadmap.yml');

    expect(roadmap).toContain('section: now');
    expect(roadmap).toContain('section: next');
    expect(roadmap).toContain('section: later');
    expect(roadmap).toContain('section: exploring');
  });

  it('renders both collections through explicit public release models', () => {
    const roadmapPage = readRepositoryFile('src/pages/roadmap.astro');
    const changelogPage = readRepositoryFile('src/pages/changelog.astro');
    const releaseModel = readRepositoryFile('src/public/release-surfaces.ts');

    expect(roadmapPage).toContain("getCollection('roadmap')");
    expect(roadmapPage).toContain('buildPublicRoadmapSections');
    expect(changelogPage).toContain("getCollection('changelog')");
    expect(changelogPage).toContain('buildPublishedChangelogIndex');
    expect(changelogPage).toContain('await render(entry)');
    expect(releaseModel).toContain("entry.status === 'completed' && !entry.release");
    expect(releaseModel).toContain('published = entries.filter((entry) => !entry.draft)');
  });
});
