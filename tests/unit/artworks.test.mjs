import test from 'node:test';
import assert from 'node:assert/strict';
import { orderArtworks } from '../../src/lib/artworks.ts';

const works = [
  { slug: 'unranked-new', sort: null, date_created: '2026-11-04T10:00:00Z' },
  { slug: 'rank-two', sort: 2, date_created: '2026-11-01T10:00:00Z' },
  { slug: 'rank-zero', sort: 0, date_created: '2026-10-01T10:00:00Z' },
  { slug: 'rank-two-new', sort: 2, date_created: '2026-11-02T10:00:00Z' },
  { slug: 'unranked-old', date_created: '2026-10-01T10:00:00Z' },
];

test('la sélection respecte les rangs, y compris zéro, puis place les œuvres non classées', () => {
  assert.deepEqual(orderArtworks(works, 'selection').map(work => work.slug), [
    'rank-zero', 'rank-two-new', 'rank-two', 'unranked-new', 'unranked-old',
  ]);
  assert.equal(works[0].slug, 'unranked-new');
});

test('les nouveautés suivent la date décroissante indépendamment du rang', () => {
  assert.deepEqual(orderArtworks(works, 'nouveautes').map(work => work.slug), [
    'unranked-new', 'rank-two-new', 'rank-two', 'rank-zero', 'unranked-old',
  ]);
});
