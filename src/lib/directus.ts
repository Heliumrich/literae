import { withPersonTitles } from './people';

export const DIRECTUS_URL =
  import.meta.env.DIRECTUS_URL || "https://api.literae.ch";

const DIRECTUS_TOKEN = import.meta.env.DIRECTUS_TOKEN as string | undefined;
const SHOULD_CACHE = import.meta.env.PROD;
const requestCache = new Map<string, Promise<unknown | null>>();

export type AssetKey = "thumbnail" | "small" | "medium" | "large" | "xlarge";

function collectionOf(endpoint: string) {
  return endpoint.split("?")[0];
}

function withParams(endpoint: string, extra: Record<string, string>) {
  const url = new URL(`https://dummy/${endpoint}`);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  const query = url.searchParams.toString();
  return `${url.pathname.slice(1)}${query ? `?${query}` : ""}`;
}

async function requestFromDirectus<T>(endpoint: string): Promise<T | null> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (DIRECTUS_TOKEN) headers.Authorization = `Bearer ${DIRECTUS_TOKEN}`;
    const res = await fetch(`${DIRECTUS_URL}/items/${endpoint}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `Erreur Directus ${res.status} sur /items/${collectionOf(endpoint)}: ${body.slice(0, 300)}`,
      );
      return null;
    }
    const json = (await res.json()) as { data: T };
    return withPersonTitles(json.data);
  } catch (error) {
    console.error("Erreur Directus:", error);
    return null;
  }
}

export async function fetchFromDirectus<T = unknown>(
  endpoint: string,
): Promise<T | null> {
  if (!SHOULD_CACHE) return requestFromDirectus<T>(endpoint);

  const cached = requestCache.get(endpoint);
  if (cached) return cached as Promise<T | null>;

  const request = requestFromDirectus<T>(endpoint);
  requestCache.set(endpoint, request);
  const result = await request;
  if (result === null) requestCache.delete(endpoint);
  return result;
}

/** Évite limit=-1 (souvent 403 en public). */
export async function fetchAllFromDirectus<T = unknown>(
  endpoint: string,
  pageSize = 100,
  options: { required?: boolean } = {},
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const batch = await fetchFromDirectus<T[]>(
      withParams(endpoint, { limit: String(pageSize), page: String(page) }),
    );
    if (batch === null && options.required) {
      throw new Error(`Collection Directus indisponible : ${collectionOf(endpoint)}. Vérifiez DIRECTUS_TOKEN et les droits de lecture avant de reconstruire.`);
    }
    if (!batch?.length) break;
    items.push(...batch);
    if (batch.length < pageSize) break;
  }
  return items;
}

const ARTIST_LIST_FIELDS =
  "id,slug,name,type,birth_year,death_year,photo,short_description,tags";

export async function fetchArtistsList() {
  return fetchAllFromDirectus<any>(
    `artists?filter[status][_eq]=published&fields=${ARTIST_LIST_FIELDS}&sort=name`,
  );
}

export function getAssetURL(
  fileId: string | null | undefined,
  key?: AssetKey | string,
) {
  if (!fileId) return null;
  if (
    fileId.startsWith("http://") ||
    fileId.startsWith("https://") ||
    fileId.startsWith("/")
  ) {
    return fileId;
  }
  const base = `${DIRECTUS_URL}/assets/${fileId}`;
  return key ? `${base}?key=${key}` : base;
}

export function getArtworkTitle(work: {
  title_french?: string | null;
  title_original?: string | null;
  title_english?: string | null;
}) {
  return (
    work.title_french ||
    work.title_original ||
    work.title_english ||
    "Sans titre"
  );
}

export function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function fileIdOf(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id: unknown }).id;
    return typeof id === "string" || typeof id === "number"
      ? String(id)
      : null;
  }
  return null;
}
