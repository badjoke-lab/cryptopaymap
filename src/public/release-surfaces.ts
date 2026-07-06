export const roadmapSectionOrder = ['now', 'next', 'later', 'exploring'] as const;
export type RoadmapSectionKey = (typeof roadmapSectionOrder)[number];

export type RoadmapStatus =
  | 'in_progress'
  | 'planned'
  | 'completed'
  | 'under_consideration'
  | 'revised';

export interface PublicRoadmapEntry {
  id: string;
  section: RoadmapSectionKey;
  order: number;
  title: string;
  status: RoadmapStatus;
  lastUpdated: string;
  outcome: string;
  includes: string[];
  dependsOn: string[];
  note?: string;
  release?: string;
}

export interface PublicRoadmapSection {
  key: RoadmapSectionKey;
  label: string;
  description: string;
  entries: Array<PublicRoadmapEntry & { releaseHref: string | null }>;
}

export interface PublicChangelogEntry {
  id: string;
  version: string;
  publishedAt: string;
  summary: string;
  draft: boolean;
  categories: string[];
}

export interface PublishedChangelogEntry extends PublicChangelogEntry {
  anchor: string;
}

const sectionLabels: Record<RoadmapSectionKey, string> = {
  now: 'Now',
  next: 'Next',
  later: 'Later',
  exploring: 'Exploring',
};

const sectionDescriptions: Record<RoadmapSectionKey, string> = {
  now: 'Capabilities currently being established or validated.',
  next: 'Accepted capabilities that follow the current foundation.',
  later: 'Planned capabilities that depend on earlier product layers.',
  exploring: 'Ideas under consideration, not implementation commitments.',
};

export const roadmapStatusLabels: Record<RoadmapStatus, string> = {
  in_progress: 'In progress',
  planned: 'Planned',
  completed: 'Completed',
  under_consideration: 'Under consideration',
  revised: 'Revised',
};

export function changelogReleaseAnchor(version: string): string {
  return `release-${version.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

export function changelogReleaseHref(version: string): string {
  return `/changelog#${changelogReleaseAnchor(version)}`;
}

export function buildPublicRoadmapSections(
  entries: readonly PublicRoadmapEntry[],
): PublicRoadmapSection[] {
  return roadmapSectionOrder
    .map((key) => ({
      key,
      label: sectionLabels[key],
      description: sectionDescriptions[key],
      entries: entries
        .filter((entry) => entry.section === key)
        .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
        .map((entry) => ({
          ...entry,
          releaseHref: entry.release ? changelogReleaseHref(entry.release) : null,
        })),
    }))
    .filter((section) => section.entries.length > 0);
}

export function buildPublishedChangelogIndex(
  entries: readonly PublicChangelogEntry[],
): PublishedChangelogEntry[] {
  return entries
    .filter((entry) => !entry.draft)
    .sort(
      (left, right) =>
        right.publishedAt.localeCompare(left.publishedAt) ||
        right.version.localeCompare(left.version) ||
        left.id.localeCompare(right.id),
    )
    .map((entry) => ({
      ...entry,
      anchor: changelogReleaseAnchor(entry.version),
    }));
}
