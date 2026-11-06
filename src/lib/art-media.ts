import { deepZoomKeyPattern } from '../../scripts/art-media-paths.mjs';

export const DEZOOMIFY_URL = 'https://dezoomify.ophir.dev/beta/';

export function artworkMedia(key: unknown) {
  if (typeof key !== 'string' || !deepZoomKeyPattern.test(key)) return null;
  const base = `/art-media/${key}`;
  return { thumb: `${base}/thumb.webp`, preview: `${base}/preview.webp`, dzi: `${base}/image.dzi` };
}
