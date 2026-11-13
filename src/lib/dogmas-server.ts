import { fetchAllFromDirectus } from './directus';
import { normalizeDogma, type Dogma } from './dogmas';

/** Read only the links for authors represented in the public library. */
export async function fetchAuthorDogmas(authorIds: string[]): Promise<Map<string, Dogma[]>> {
  const ids = [...new Set(authorIds)];
  const result = new Map<string, Dogma[]>();
  if (!ids.length) return result;
  const query = new URLSearchParams({
    'filter[artists_id][_in]': ids.join(','),
    fields: 'artists_id,dogmas_id.id,dogmas_id.archived,dogmas_id.title,dogmas_id.description,dogmas_id.url,dogmas_id.grade',
    sort: 'id',
  });
  const links = await fetchAllFromDirectus<{ artists_id: string; dogmas_id: unknown }>(`artists_dogmas?${query}`, 100, { required: true });
  for (const link of links) {
    const dogma = normalizeDogma(link.dogmas_id);
    if (dogma && ids.includes(link.artists_id)) result.set(link.artists_id, [...(result.get(link.artists_id) || []), dogma]);
  }
  return result;
}
