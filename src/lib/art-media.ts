import { deepZoomKeyPattern } from '../../scripts/art-media-paths.mjs';

export const HOME_FEATURED_ARTWORK_SLUG = 'ng-bartolome-esteban-murillo-christ-healing-the-paralytic-at-the-pool-of-bethesda';
export const GALLERY_FEATURED_ARTWORK_SLUG = 'velazquez-couronnement-vierge';

const heroImageHeights = new Map([
  [HOME_FEATURED_ARTWORK_SLUG, 1288],
  ['ng-guido-reni-saint-jerome', 1541],
  [GALLERY_FEATURED_ARTWORK_SLUG, 1597],
]);
const heroWidths = [480, 768, 960, 1200, 1600, 2048];

export function artworkHeroImage(work?: { slug: string; media: { preview: string } }) {
  if (!work) return undefined;
  const height = heroImageHeights.get(work.slug);
  if (!height) return { src: work.media.preview };
  const heroImagePath = (width: number) => `/hero-art/${work.slug}-${width}.webp`;
  return {
    src: heroImagePath(1200),
    srcset: heroWidths.map(width => `${heroImagePath(width)} ${width}w`).join(', '),
    width: 1200,
    height,
  };
}

export const DEZOOMIFY_URL = 'https://dezoomify.ophir.dev/beta/';

export function artworkMedia(key: unknown) {
  if (typeof key !== 'string' || !deepZoomKeyPattern.test(key)) return null;
  const base = `/art-media/${key}`;
  return { thumb: `${base}/thumb.webp`, preview: `${base}/preview.webp`, dzi: `${base}/image.dzi` };
}
