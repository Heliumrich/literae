import { normalizeText } from "./catalog.ts";

export function isDoreArtwork(work: { artist?: { slug?: string; name?: string } | null }) {
  return normalizeText(work.artist?.slug || "") === "gustave dore" ||
    normalizeText(work.artist?.name || "") === "gustave dore";
}

export type ArtworkOrder = 'selection' | 'nouveautes';

export function artworkOrder(pathname: string): ArtworkOrder {
  return pathname.replace(/\/+$/, '').endsWith('/nouveautes') ? 'nouveautes' : 'selection';
}
export const artworkOrderPath = (order: ArtworkOrder) => `/oeuvres/${order}`;

type RankedArtwork = { sort?: number | null; date_created?: string | null; slug: string };

/** Manual ranks first (ascending); unranked works follow. Dates and slugs break ties. */
export function orderArtworks<T extends RankedArtwork>(items: T[], order: ArtworkOrder): T[] {
  return [...items].sort((a, b) => {
    if (order === 'selection') {
      const rankA = a.sort ?? Infinity;
      const rankB = b.sort ?? Infinity;
      if (rankA !== rankB) return rankA < rankB ? -1 : 1;
    }
    return (b.date_created || '').localeCompare(a.date_created || '') || a.slug.localeCompare(b.slug);
  });
}
