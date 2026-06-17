import { getCollection, render } from 'astro:content';
import type { ImageMetadata } from 'astro';

export interface AppMeta {
  slug:             string;
  name:             string;
  platform:         string;
  shortDescription: string;
  date?:            string;
  featureImage?:    ImageMetadata;
  featureImageCaption?: string;
  githubRepo?:      string;
}

export async function getAppsByPlatform(platform: string): Promise<Map<string, AppMeta>> {
  const entries = await getCollection('applications', e => e.data.platform === platform);
  const map = new Map<string, AppMeta>();
  for (const e of entries) {
    const slug = e.id.replace(/\.mdoc$/, '');
    map.set(slug, {
      slug,
      name:             e.data.name,
      platform:         e.data.platform,
      shortDescription: e.data.shortDescription,
      date:             e.data.date ?? undefined,
      featureImage:     e.data.featureImage as ImageMetadata | undefined,
      featureImageCaption: e.data.featureImageCaption,
      githubRepo:       e.data.githubRepo,
    });
  }
  return map;
}

export async function getAppEntry(slug: string): Promise<{ meta: AppMeta; Content: unknown } | null> {
  const entries = await getCollection('applications', e => e.id.replace(/\.mdoc$/, '') === slug);
  if (!entries.length) return null;
  const e = entries[0];
  const { Content } = await render(e);
  return {
    meta: {
      slug:             e.id.replace(/\.mdoc$/, ''),
      name:             e.data.name,
      platform:         e.data.platform,
      shortDescription: e.data.shortDescription,
      date:             e.data.date ?? undefined,
      featureImage:     e.data.featureImage as ImageMetadata | undefined,
      featureImageCaption: e.data.featureImageCaption,
      githubRepo:       e.data.githubRepo,
    },
    Content,
  };
}
