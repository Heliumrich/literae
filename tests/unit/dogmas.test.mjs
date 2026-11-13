import test from 'node:test';
import assert from 'node:assert/strict';
import { dogmaBand, normalizeDogma, dogmaGroups } from '../../src/lib/dogmas.ts';
const point = (grade, id = 'point') => ({ id, archived: false, title: 'Titre', description: 'Description', grade, url: 'https://example.org/info' });

test('les cinq tranches respectent les bornes éditoriales', () => {
  for (const [grade, band] of [[-10,'danger'],[-6,'danger'],[-5,'caution'],[-1,'caution'],[0,'nuance'],[1,'defender'],[5,'defender'],[6,'exemplary'],[10,'exemplary']]) assert.equal(dogmaBand(grade), band);
});
test('les entrées archivées, sans titre ou hors échelle ne sont pas publiées', () => {
  for (const invalid of [null, point(11), point(-11), point(1.5), point(null), { ...point(1), archived: true }, { ...point(1), title: ' ' }]) assert.equal(normalizeDogma(invalid), null);
  assert.equal(normalizeDogma(point(0)).grade, 0);
  assert.equal(normalizeDogma({ ...point(1), url: 'javascript:alert(1)' }).url, null);
});
test('les positifs précèdent la vigilance ; zéro reste distinct et les doublons sont retirés', () => {
  const points = [-1, 0, 10, -10, 1].map(grade => normalizeDogma(point(grade, String(grade))));
  const groups = dogmaGroups([...points, points[0]]);
  assert.deepEqual(groups.map(group => group.points.map(point => point.grade)), [[10, 1], [-10, -1, 0]]);
  assert.deepEqual(dogmaGroups([]), []);
});
