import { fetchArtworkCatalog } from "../lib/artworks-server";
import type { APIRoute } from "astro";
import {
  getAssetURL,
  getArtworkTitle,
  fileIdOf,
} from "../lib/directus";
import { parseTags, searchHaystack, jsonItems } from "../lib/catalog";
import { orderArtworks, isDoreArtwork } from "../lib/artworks";

export const prerender = true;

export const GET: APIRoute = async () => {
  const artworks = orderArtworks(await fetchArtworkCatalog(), 'selection');

  const items = artworks.map((work) => {
    const tags = parseTags(work.tags);
    return {
      slug: work.slug,
      sort: work.sort ?? null,
      date_created: work.date_created ?? null,
      href: `/oeuvres/${work.slug}`,
      title: getArtworkTitle(work),
      year: work.year ?? null,
      epic: isDoreArtwork(work),
      artist:
        work.artist && typeof work.artist === "object" ? work.artist.name : null,
      thumb: getAssetURL(fileIdOf(work.image), "thumbnail"),
      medium: getAssetURL(fileIdOf(work.image), "medium"),
      large: getAssetURL(fileIdOf(work.image), "large"),
      xlarge: getAssetURL(fileIdOf(work.image), "xlarge"),
      original: getAssetURL(fileIdOf(work.image)),
      originalWidth: work.image?.width || null,
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
