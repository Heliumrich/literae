import test from 'node:test';
import assert from 'node:assert/strict';
import { bookEditions } from '../../src/lib/book-editions.ts';
const file = (id, label, pair) => ({
  id,
  title: `Livre (${label})`,
  filename_download: `${id}.epub`,
  type: 'application/epub+zip',
  filesize: 10,
  modified_on: null,
  metadata: pair ? { literae_reader_file_id: pair } : {},
});
const link = (id, f, sort) => ({ id, sort, directus_files_id: f });
const url = (f) => `/assets/${f.id}`;
test('les deux traductions ont des téléchargements distincts, selon leur ordre explicite', () => {
  const web = [link(1, file('web-B', 'B'), 2), link(2, file('web-A', 'A'), 1)];
  const dl = [
    link(5, file('dl-A', 'A', 'web-A'), 1),
    link(4, file('dl-B', 'B', 'web-B'), 2),
  ];
  const editions = bookEditions(web, dl, url, 'Livre');
  assert.deepEqual(
    editions.map((e) => [e.url, e.downloadUrl]),
    [
      ['/assets/web-A', '/assets/dl-A'],
      ['/assets/web-B', '/assets/dl-B'],
    ],
  );
});
test('les correspondances incompatibles font échouer le build plutôt que mélanger les éditions', () => {
  const web = [link(1, file('web-A', 'A')), link(2, file('web-B', 'B'))];
  assert.throws(
    () =>
      bookEditions(
        web,
        [
          link(3, file('dl-B', 'B', 'web-B')),
          link(4, file('dl-A', 'A', 'web-A')),
        ],
        url,
        'Livre',
      ),
    /ne correspondent pas/,
  );
  assert.throws(() => bookEditions(web, [], url, 'Livre'), /même nombre/);
  assert.throws(
    () =>
      bookEditions(
        web,
        [link(1, file('dl-B', 'B')), link(2, file('dl-A', 'A'))],
        url,
        'Livre',
      ),
    /ne correspondent pas/,
  );
});
