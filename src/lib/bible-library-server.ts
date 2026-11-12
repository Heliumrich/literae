import { fetchBooks } from './books-server';
import { LIBRARY_PATH } from './books';
import { readerBibleProfile } from './reader/bible-profile';

/** Reuse the reader's editorial identities; only link books with a published EPUB. */
export async function getBibleLibraryEditions() {
  const editions: Record<string, { href: string; label: string }> = {};
  for (const book of await fetchBooks()) {
    const code = readerBibleProfile(book.id).translation;
    if (!code || !book.editions.length) continue;
    editions[code] = {
      href: `${LIBRARY_PATH}/${book.slug}`,
      label: code === 'SAC' ? 'Lire la version complète' : 'Lire la version complète annotée',
    };
  }
  return editions;
}
