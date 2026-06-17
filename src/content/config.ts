import { defineCollection, z } from 'astro:content';

const dateField = z.preprocess(
  v => v instanceof Date ? v.toISOString().split('T')[0] : v,
  z.string().optional(),
);

const platforms = defineCollection({
  type: 'content',
  schema: z.object({
    displayName: z.string(),
    shortName: z.string(),
    meatloaf: z.boolean().default(false),
    sortOrder: z.number().default(99),
  }),
});

const applications = defineCollection({
  type: 'content',
  schema: ({ image }) => z.object({
    name: z.string(),
    platform: z.string(),
    shortDescription: z.string(),
    date: dateField,
    featureImage: image().optional(),
    featureImageCaption: z.string().optional(),
    githubRepo: z.string().url().optional(),
  }),
});

export const collections = {
  platforms,
  applications,
};
