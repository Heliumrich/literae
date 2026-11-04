import { fetchAllFromDirectus, fetchFromDirectus } from './directus';

export const ARTWORK_FIELDS = 'id,slug,sort,date_created,title_french,title_original,title_english,year,image,tags,artist.name,artist.type,artist.slug';
export const fetchArtworkCatalog = () => fetchAllFromDirectus<any>(
  `artworks?filter[status][_eq]=published&fields=${ARTWORK_FIELDS}&sort=-date_created,id`,
  100, { required: true },
);
const SELECTION = [
  'fra-angelico-annonciation-prado',
  'the-vision-of-the-blessed-hermann-joseph',
  'veronese-noces-cana',
  'claude-vignon-saint-ambroise',
  'destruction-of-leviathan',
];
export async function fetchArtSelection() {
  const items = await fetchFromDirectus<any[]>(
    `artworks?filter[status][_eq]=published&filter[slug][_in]=${SELECTION.join(',')}&fields=${ARTWORK_FIELDS}&limit=${SELECTION.length}`,
  ) || [];
  return SELECTION.flatMap(slug => items.filter(work => work.slug === slug));
}
