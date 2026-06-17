import { getCollection } from 'astro:content';

export interface PlatformMeta {
  slug:        string;
  displayName: string;
  shortName:   string;
  meatloaf:    boolean;
  sortOrder:   number;
}

export async function getPlatforms(): Promise<PlatformMeta[]> {
  const entries = await getCollection('platforms');
  return entries
    .map(e => ({
      slug:        e.id.replace(/\.mdoc$/, ''),
      displayName: e.data.displayName,
      shortName:   e.data.shortName,
      meatloaf:    e.data.meatloaf,
      sortOrder:   e.data.sortOrder,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName));
}

export async function getPlatformBySlug(slug: string): Promise<PlatformMeta | null> {
  const platforms = await getPlatforms();
  return platforms.find(p => p.slug === slug) ?? null;
}
