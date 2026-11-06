import { readFileSync } from 'node:fs';
import { fetchAllFromDirectus } from './directus';
import { artworkMedia } from './art-media';

const ARTWORK_FIELDS = 'id,slug,sort,date_created,title_french,title_original,title_english,year,tags,artist.name,artist.type,artist.slug';
const pilot = process.env.ART_MEDIA_PILOT_MANIFEST
  ? new Map<string, string>(Object.entries(JSON.parse(readFileSync(process.env.ART_MEDIA_PILOT_MANIFEST, 'utf8'))))
  : null;

export async function fetchZoomArtworks(fields: string, sort = '-date_created,id') {
  const links = pilot ? '' : '&filter[deep_zoom_key][_nnull]=true';
  const rows = await fetchAllFromDirectus<any>(
    `artworks?filter[status][_eq]=published${links}&fields=${fields}${pilot ? '' : ',deep_zoom_key'}&sort=${sort}`,
    100, { required: true },
  );
  return rows.flatMap(work => {
    const media = artworkMedia(pilot ? pilot.get(String(work.id)) : work.deep_zoom_key);
    return media ? [{ ...work, media }] : [];
  });
}

export const fetchArtworkCatalog = () => fetchZoomArtworks(ARTWORK_FIELDS);
const SELECTION = [
  'fra-angelico-annonciation-prado',
  'the-vision-of-the-blessed-hermann-joseph',
  'veronese-noces-cana',
  'claude-vignon-saint-ambroise',
  'destruction-of-leviathan',
];
export async function fetchArtSelection() {
  const items = await fetchArtworkCatalog();
  return SELECTION.flatMap(slug => items.filter(work => work.slug === slug));
}
