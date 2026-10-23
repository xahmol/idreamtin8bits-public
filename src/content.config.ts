import { defineCollection } from 'astro:content';
import { glob, type Loader } from 'astro/loaders';
import { z } from 'astro/zod';

// Content Layer loader per collection folder. generateId keeps the filename
// *with* extension as the entry id (as the pre-Astro-6 collections did), so
// code strips '.mdoc' itself; the store is re-filled sorted by id so
// getCollection() returns entries in a stable filename order.
const mdoc = (dir: string): Loader => {
  const inner = glob({
    pattern: '*.mdoc',
    base: `./src/content/${dir}`,
    generateId: ({ entry }) => entry,
  });
  return {
    ...inner,
    load: async (context) => {
      await inner.load(context);
      const sorted = [...context.store.values()].sort((a, b) => a.id.localeCompare(b.id));
      context.store.clear();
      for (const entry of sorted) context.store.set(entry);
    },
  };
};

const dateField = z.preprocess(
  v => v instanceof Date ? v.toISOString().split('T')[0] : v,
  z.string().optional(),
);

const platforms = defineCollection({
  loader: mdoc('platforms'),
  schema: z.object({
    displayName: z.string(),
    shortName: z.string(),
    meatloaf: z.boolean().default(false),
    sortOrder: z.number().default(99),
  }),
});

const applications = defineCollection({
  loader: mdoc('applications'),
  schema: ({ image }) => z.object({
    name: z.string(),
    platform: z.string(),
    shortDescription: z.string(),
    date: dateField,
    featureImage: image().optional(),
    featureImageCaption: z.string().optional(),
    githubRepo: z.url().optional(),
  }),
});

export const collections = {
  platforms,
  applications,
};
