import { searchHaystack } from './catalog';
import { escapeHtml } from './catalog-ui';

export const LIBRARY_PATH = '/scriptorium/bibliotheque';

export type BookEdition = { id: string; label: string; url: string; downloadUrl: string; size: number };
export type LibraryBook = {
  id: string; slug: string; title: string; description: string; cover: string | null;
  author: { id: string; name: string; slug: string } | null;
  tags: string[]; created: string; editions: BookEdition[];
};
export type BookItem = {
  id: string; href: string; title: string; author: string; cover: string | null;
  description: string; tags: string[]; haystack: string;
};

export function bookItem(book: LibraryBook, base = ''): BookItem {
  return {
    id: book.id, href: `${base}${LIBRARY_PATH}/${book.slug}`, title: book.title,
    author: book.author?.name || 'Auteur non renseigné', cover: book.cover,
    description: book.description, tags: book.tags,
    haystack: searchHaystack([book.title, book.author?.name, book.description, ...book.tags]),
  };
}

/** Shared by static pages and filtering, with all CMS values escaped. */
export function bookCardHtml(item: BookItem, eager = false): string {
  const e = escapeHtml;
  const image = item.cover
    ? `<img src="${e(item.cover)}" alt="Couverture de ${e(item.title)}" width="480" height="640" loading="${eager ? 'eager' : 'lazy'}" decoding="async" />`
    : '<span class="book-cover-empty"><img src="/fleur-de-lys.svg" alt="" width="48" height="48" /></span>';
  return `<article class="book-card"><a href="${e(item.href)}">
    <div class="book-card-cover">${image}</div><div class="book-card-copy">
    <p class="card-kicker">${e(item.author)}</p><h2>${e(item.title)}</h2>
    ${item.description ? `<p class="book-card-description">${e(item.description)}</p>` : ''}
    ${item.tags.length ? `<p class="book-card-tags">${item.tags.map(e).join(' · ')}</p>` : ''}
    </div></a></article>`;
}
