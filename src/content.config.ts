import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

const roadmap = defineCollection({
  loader: file('content/roadmap.yml'),
  schema: z.object({
    section: z.enum(['now', 'next', 'later', 'exploring']),
    order: z.number().int(),
    title: z.string(),
    status: z.string(),
    lastUpdated: z.string(),
    outcome: z.string(),
    includes: z.array(z.string()),
    dependsOn: z.array(z.string()),
  }),
});

const changelog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/changelog' }),
  schema: z.object({
    version: z.string(),
    publishedAt: z.string(),
    summary: z.string(),
    draft: z.boolean().default(false),
    categories: z.array(z.string()),
  }),
});

export const collections = { roadmap, changelog };
