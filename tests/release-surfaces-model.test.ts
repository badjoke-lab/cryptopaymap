import { describe, expect, it } from 'vitest';
import {
  buildPublicRoadmapSections,
  buildPublishedChangelogIndex,
  changelogReleaseHref,
  type PublicChangelogEntry,
  type PublicRoadmapEntry,
} from '../src/public/release-surfaces';

const roadmapEntries: PublicRoadmapEntry[] = [
  {
    id: 'future-tool',
    section: 'exploring',
    order: 30,
    title: 'Future tool',
    status: 'under_consideration',
    lastUpdated: '2026-07-01',
    outcome: 'Consider a future capability.',
    includes: [],
    dependsOn: [],
  },
  {
    id: 'core-release',
    section: 'now',
    order: 20,
    title: 'Core release',
    status: 'completed',
    lastUpdated: '2026-07-02',
    outcome: 'Release the core public experience.',
    includes: ['Discovery'],
    dependsOn: ['Public data'],
    release: '0.2.0',
  },
  {
    id: 'data-foundation',
    section: 'now',
    order: 10,
    title: 'Data foundation',
    status: 'in_progress',
    lastUpdated: '2026-07-01',
    outcome: 'Build verified public data.',
    includes: ['Evidence'],
    dependsOn: [],
  },
];

const changelogEntries: PublicChangelogEntry[] = [
  {
    id: 'release-old',
    version: '0.1.0',
    publishedAt: '2026-06-20',
    summary: 'Older public release',
    draft: false,
    categories: ['Added'],
  },
  {
    id: 'release-draft',
    version: '0.3.0',
    publishedAt: '2026-07-10',
    summary: 'Unpublished draft',
    draft: true,
    categories: ['Changed'],
  },
  {
    id: 'release-current',
    version: '0.2.0',
    publishedAt: '2026-07-02',
    summary: 'Current public release',
    draft: false,
    categories: ['Added', 'Fixed'],
  },
];

describe('public Roadmap and Changelog models', () => {
  it('orders Roadmap sections and entries deterministically and links releases', () => {
    const sections = buildPublicRoadmapSections(roadmapEntries);

    expect(sections.map((section) => section.key)).toEqual(['now', 'exploring']);
    expect(sections[0]?.entries.map((entry) => entry.id)).toEqual([
      'data-foundation',
      'core-release',
    ]);
    expect(sections[0]?.entries[1]?.releaseHref).toBe('/changelog#release-0-2-0');
    expect(sections[1]?.description).toContain('not implementation commitments');
  });

  it('requires Completed Roadmap entries to reference a Changelog release', () => {
    const completedWithoutRelease = {
      ...roadmapEntries[1],
      id: 'missing-release',
      release: undefined,
    } as PublicRoadmapEntry;

    expect(() => buildPublicRoadmapSections([completedWithoutRelease])).toThrow(
      /requires a Changelog release/,
    );
  });

  it('removes draft Changelog entries and sorts published releases newest first', () => {
    const published = buildPublishedChangelogIndex(changelogEntries);

    expect(published.map((entry) => entry.id)).toEqual(['release-current', 'release-old']);
    expect(published.map((entry) => entry.anchor)).toEqual(['release-0-2-0', 'release-0-1-0']);
  });

  it('rejects duplicate published Changelog versions', () => {
    const duplicate = {
      ...changelogEntries[0],
      id: 'release-duplicate',
    };

    expect(() => buildPublishedChangelogIndex([...changelogEntries, duplicate])).toThrow(
      /versions must be unique/,
    );
  });

  it('uses stable release anchors for Roadmap links', () => {
    expect(changelogReleaseHref('0.12.0-beta 1')).toBe('/changelog#release-0-12-0-beta-1');
  });
});
