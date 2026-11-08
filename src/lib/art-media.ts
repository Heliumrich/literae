import { deepZoomKeyPattern } from '../../scripts/art-media-paths.mjs';

export const FEATURED_ARTWORK_SLUG = 'velazquez-couronnement-vierge';

const heroImagePath = (width: number) => `/hero-art/${FEATURED_ARTWORK_SLUG}-${width}.webp`;
const heroWidths = [480, 768, 960, 1200, 1600, 2048];

export function artworkHeroImage(work?: { slug: string; media: { preview: string } }) {
  if (!work) return undefined;
  if (work.slug !== FEATURED_ARTWORK_SLUG) return { src: work.media.preview };
  return {
    src: heroImagePath(1200),
    srcset: heroWidths.map(width => `${heroImagePath(width)} ${width}w`).join(', '),
    width: 1200,
    height: 1597,
  };
}

export const DEZOOMIFY_URL = 'https://dezoomify.ophir.dev/beta/';

export function artworkMedia(key: unknown) {
  if (typeof key !== 'string' || !deepZoomKeyPattern.test(key)) return null;
  const base = `/art-media/${key}`;
  return { thumb: `${base}/thumb.webp`, preview: `${base}/preview.webp`, dzi: `${base}/image.dzi` };
}
