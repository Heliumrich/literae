import type { APIRoute } from "astro";
import {
  fetchAllFromDirectus,
  getAssetURL,
  getArtworkTitle,
  fileIdOf,
} from "../../lib/directus";
import { parseTags, searchHaystack, jsonItems } from "../../lib/catalog";

export const prerender = true;

export const GET: APIRoute = async () => {
  const artworks = await fetchAllFromDirectus<any>(
    "artworks?filter[status][_eq]=published&fields=id,slug,title_french,title_original,title_english,year,image,tags,artist.name,artist.type,artist.slug&sort=-date_created",
  );

  const items = artworks.map((work) => {
    const tags = parseTags(work.tags);
    return {
      slug: work.slug,
      href: `/oeuvres/${work.slug}`,
      title: getArtworkTitle(work),
      year: work.year ?? null,
      artist:
        work.artist && typeof work.artist === "object" ? work.artist.name : null,
      thumb: getAssetURL(fileIdOf(work.image), "thumbnail"),
      medium: getAssetURL(fileIdOf(work.image), "medium"),
      large: getAssetURL(fileIdOf(work.image), "large"),
      xlarge: getAssetURL(fileIdOf(work.image), "xlarge"),
      original: getAssetURL(fileIdOf(work.image)),
      tags,
      haystack: searchHaystack([
        work.title_french,
        work.title_original,
        work.title_english,
        work.artist?.name,
      ]),
    };
  });

  return jsonItems(items);
};
