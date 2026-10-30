import { createHash } from 'node:crypto';
import { fetchAllFromDirectus, getAssetURL } from './directus';
import { normalizeText, parseTags } from './catalog';
import type { LibraryBook } from './books';
import { bookEditions, type EditionLink } from './book-editions';

type BookRow = {
  id: string; archived: boolean; sort: number | null; title: string; short_description: string | null;
  cover_image: { id: string; modified_on: string | null; filesize: number | string | null } | null;
  tags: unknown; date_created: string | null;
  author: { id: string; name: string; slug: string; status: string; type: unknown } | null;
  ebook_files: EditionLink[];
  ebook_download_files: EditionLink[];
};
const BOOK_FIELDS = [
  'id', 'archived', 'sort', 'title', 'short_description', 'tags', 'date_created',
  'cover_image.id', 'cover_image.modified_on', 'cover_image.filesize',
  'author.id', 'author.name', 'author.type', 'author.slug', 'author.status',
  ...['ebook_files', 'ebook_download_files'].flatMap(relation => [
    `${relation}.*`,
    ...['id', 'title', 'filename_download', 'type', 'filesize', 'modified_on', 'metadata'].map(field => `${relation}.directus_files_id.${field}`),
  ]),
].join(',');

function assetRevision(file: { id: string; modified_on: unknown; filesize: unknown }) {
  return createHash('sha256').update(`${file.id}:${file.modified_on}:${file.filesize}`).digest('hex').slice(0, 12);
}

/** books has an archived flag, not the status/slug fields used by artworks. */
export async function fetchBooks(): Promise<LibraryBook[]> {
  const rows = await fetchAllFromDirectus<BookRow>(`books?filter[archived][_eq]=false&fields=${BOOK_FIELDS}&sort=sort,title,id`, 100, { required: true });
  return rows.filter(row => !row.archived && row.id && row.title).map(row => ({
    id: String(row.id),
    slug: `${normalizeText(row.title).replaceAll(' ', '-') || 'livre'}-${String(row.id).slice(0, 8)}`,
    title: row.title, description: row.short_description || '',
    cover: row.cover_image
      ? `${getAssetURL(row.cover_image.id, 'medium')}&v=${assetRevision(row.cover_image)}` : null,
    author: row.author?.status === 'published' && row.author.slug
      ? { id: String(row.author.id), name: row.author.name, slug: row.author.slug } : null,
    tags: [...new Set(parseTags(row.tags))], created: row.date_created || '',
    editions: bookEditions(row.ebook_files, row.ebook_download_files, file => {
      const revision = assetRevision(file);
      return `${getAssetURL(file.id)}?v=${revision}`;
    }, row.title),
  }));
}
