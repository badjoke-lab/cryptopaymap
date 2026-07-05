import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { parsePublicPlacePinsDocument } from './public/places-discovery';
import { parsePublicPlacesDocument } from './public/place-detail';

const roadmap = defineCollection({
  loader: file('content/roadmap.yml'),
  schema: z.object({
    section: z.enum(['now', 'next', 'later', 'exploring']),
    order: z.number().int().nonnegative(),
    title: z.string().min(1),
    status: z.enum(['in_progress', 'planned', 'completed', 'under_consideration', 'revised']),
    lastUpdated: z.string().min(10),
    outcome: z.string().min(1),
    includes: z.array(z.string().min(1)),
    dependsOn: z.array(z.string().min(1)),
    note: z.string().min(1).optional(),
    release: z.string().min(5).optional(),
  }),
});

const changelog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/changelog' }),
  schema: z.object({
    version: z.string().min(5),
    publishedAt: z.string().min(10),
    summary: z.string().min(1),
    draft: z.boolean().default(false),
    categories: z
      .array(
        z.enum([
          'Added',
          'Changed',
          'Fixed',
          'Data and verification',
          'Security',
          'Deprecated',
          'Removed',
        ]),
      )
      .min(1),
  }),
});

const publicPlaces = defineCollection({
  loader: file('public/data/places.json', {
    parser: (text) =>
      parsePublicPlacesDocument(JSON.parse(text) as unknown).map((place) => ({
        id: place.placeSlug,
        place,
      })),
  }),
});

const publicPlacePins = defineCollection({
  loader: file('public/data/place-pins.json', {
    parser: (text) =>
      parsePublicPlacePinsDocument(JSON.parse(text) as unknown).map((pin) => ({
        id: pin.placeSlug,
        pin,
      })),
  }),
});

export const collections = { roadmap, changelog, publicPlaces, publicPlacePins };
