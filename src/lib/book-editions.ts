import type { BookEdition } from './books';

export type EditionFile = {
  id: string;
  title: string | null;
  filename_download: string | null;
  type: string | null;
  filesize: number | string | null;
  modified_on: string | null;
  metadata?: {
    literae_reader_file_id?: string;
    literae_download_file_id?: string;
  } | null;
};
export type EditionLink = {
  id: number;
  sort?: number | null;
  directus_files_id: EditionFile | null;
};

export function editionLabel(file: EditionFile): string {
  const title = (file.title || file.filename_download || 'Édition').replace(
    /\.epub$/i,
    '',
  );
  return title.match(/\((.+)\)/)?.[1].trim() || title;
}
const key = (label: string) =>
  label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const ordered = (links: EditionLink[]) =>
  [...links].sort((a, b) => (a.sort ?? a.id) - (b.sort ?? b.id) || a.id - b.id);
const epub = (file: EditionFile | null): file is EditionFile =>
  !!file?.id &&
  (file.type === 'application/epub+zip' ||
    /\.epub$/i.test(file.filename_download || ''));

/** Never guess between translations: both fields share their order and pairing. */
export function bookEditions(
  readers: EditionLink[],
  downloads: EditionLink[],
  assetUrl: (file: EditionFile) => string,
  title: string,
): BookEdition[] {
  const web = ordered(readers || []),
    originals = ordered(downloads || []);
  if (web.length !== originals.length)
    throw new Error(
      `${title} : les champs ebook_files et ebook_download_files doivent contenir le même nombre d’éditions.`,
    );
  return web.flatMap((link, index) => {
    const file = link.directus_files_id,
      original = originals[index]?.directus_files_id;
    if (!epub(file) || !epub(original))
      throw new Error(
        `${title} : EPUB de lecture ou de téléchargement manquant à la position ${index + 1}.`,
      );
    const paired = original.metadata?.literae_reader_file_id;
    if (
      file.metadata?.literae_download_file_id &&
      file.metadata.literae_download_file_id !== original.id
    )
      throw new Error(
        `${title} : fichier original incompatible à la position ${index + 1}.`,
      );
    if (
      paired
        ? paired !== file.id
        : web.length > 1 &&
          key(editionLabel(file)) !== key(editionLabel(original))
    ) {
      throw new Error(
        `${title} : les traductions à la position ${index + 1} ne correspondent pas. Vérifiez l’ordre des deux relations de fichiers.`,
      );
    }
    return [
      {
        id: file.id,
        label: editionLabel(file),
        url: assetUrl(file),
        downloadUrl: assetUrl(original),
        size: Number(file.filesize) || 0,
      },
    ];
  });
}
