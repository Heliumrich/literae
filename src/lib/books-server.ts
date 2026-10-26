import { createHash } from 'node:crypto';
import { fetchAllFromDirectus, fileIdOf, getAssetURL } from './directus';
import { normalizeText, parseTags } from './catalog';
import type { LibraryBook } from './books';

type BookFile = {
  id: string; title: string | null; description: string | null; filename_download: string | null;
  type: string | null; filesize: number | string | null; modified_on: string | null;
};
type BookRow = {
  id: string; archived: boolean; title: string; short_description: string | null;
  cover_image: unknown; tags: unknown; date_created: string | null;
  author: { id: string; name: string; slug: string; status: string } | null;
  ebook_files: { directus_files_id: BookFile | null }[];
};
const BOOK_FIELDS = [
  'id', 'archived', 'title', 'short_description', 'cover_image', 'tags', 'date_created',
  'author.id', 'author.name', 'author.slug', 'author.status',
  ...['id', 'title', 'description', 'filename_download', 'type', 'filesize', 'modified_on']
    .map(field => `ebook_files.directus_files_id.${field}`),
].join(',');

/** books has an archived flag, not the status/slug fields used by artworks. */
export async function fetchBooks(): Promise<LibraryBook[]> {
  const rows = await fetchAllFromDirectus<BookRow>(`books?filter[archived][_eq]=false&fields=${BOOK_FIELDS}&sort=title`, 100, { required: true });
  return rows.filter(row => !row.archived && row.id && row.title).map(row => ({
    id: String(row.id),
    slug: `${normalizeText(row.title).replaceAll(' ', '-') || 'livre'}-${String(row.id).slice(0, 8)}`,
    title: row.title, description: row.short_description || '',
    cover: getAssetURL(fileIdOf(row.cover_image), 'medium'),
    author: row.author?.status === 'published' && row.author.slug
      ? { id: String(row.author.id), name: row.author.name, slug: row.author.slug } : null,
    tags: [...new Set(parseTags(row.tags))], created: row.date_created || '',
    editions: (Array.isArray(row.ebook_files) ? row.ebook_files : []).flatMap(link => {
      const file = link.directus_files_id;
      if (!file?.id || !(file.type === 'application/epub+zip' || /\.epub$/i.test(file.filename_download || ''))) return [];
      // A changed asset gets a new URL even if its Directus UUID stays the same.
      const revision = createHash('sha256').update(`${file.id}:${file.modified_on}:${file.filesize}`).digest('hex').slice(0, 12);
      const displayName = (file.title || file.filename_download || 'Édition').replace(/\.epub$/i, '');
      return [{
        id: String(file.id), label: displayName.match(/\((.+)\)/)?.[1].trim() || displayName,
        url: `${getAssetURL(file.id)}?v=${revision}`, size: Number(file.filesize) || 0,
      }];
    }),
  }));
}
