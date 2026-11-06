import { fetchAllFromDirectus } from './directus';
import { fetchBooks } from './books-server';
import { fetchZoomArtworks } from './artworks-server';

export const PERSON_WORKS_PER_PAGE = 20;

export async function personPaths() {
  const relationId = (value: any) => {
    if (value && typeof value === "object") return String(value.id ?? "");
    return String(value ?? "");
  };
  const depictedIds = (work: any) =>
    Array.isArray(work.depicted)
      ? work.depicted.map((relation: any) =>
          relationId(relation?.artists_id ?? relation),
        )
      : [];

  const [people, works, books] = await Promise.all([
    fetchAllFromDirectus<any>(
      "artists?filter[status][_eq]=published&fields=*&sort=name",
    ),
    fetchZoomArtworks(
      "id,slug,title_original,title_french,title_english,year,artist.id,artist.name,artist.type,artist.slug,depicted.artists_id.id", '-year,id',
    ),
    fetchBooks(),
  ]);

  return people
    .filter((person) => person?.slug)
    .map((person) => {
      const id = String(person.id);
      return {
        params: { slug: String(person.slug) },
        props: {
          person,
          createdWorks: works.filter((work) => relationId(work.artist) === id),
          depictedWorks: works.filter((work) => depictedIds(work).includes(id)),
          books: books.filter(book => book.author?.id === id),
        },
      };
    });
}


export async function personWorksPagePaths() {
  return (await personPaths()).flatMap(({ params, props }) =>
    Array.from({ length: Math.max(0, Math.ceil(props.createdWorks.length / PERSON_WORKS_PER_PAGE) - 1) }, (_, index) => ({
      params: { slug: params.slug, page: String(index + 2) },
      props: { ...props, page: index + 2 },
    })),
  );
}
