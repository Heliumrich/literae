import test from 'node:test';
import assert from 'node:assert/strict';
import { personName, withPersonTitles } from '../../src/lib/people.ts';

test('le titre de saint suit le type sans doubler les titres existants', () => {
  assert.equal(personName("Augustin d’Hippone", ['author', 'saint']), "saint Augustin d’Hippone");
  assert.equal(personName('Jean Chrysostome', 'saint,author'), 'saint Jean Chrysostome');
  assert.equal(personName('Saint Augustin', ['saint']), 'saint Augustin');
  assert.equal(personName('Sainte Thérèse', ['saint']), 'sainte Thérèse');
  assert.equal(personName('Ste. Thérèse', ['saint']), 'sainte Thérèse');
  assert.equal(personName('St. Thomas', ['saint']), 'saint Thomas');
  assert.equal(personName('Jean de Saint-Igny', ['artist']), 'Jean de Saint-Igny');
});
test('les noms liés sont cohérents et les titres des œuvres et slugs restent intacts', () => {
  const input = [{ title: 'Saint Augustin', author: { name: 'Augustin', type: ['saint'], slug: 'augustin' }, depicted: [{ artists_id: { name: 'Jean', type: ['saint'] } }] }];
  const result = withPersonTitles(input);
  assert.equal(result[0].author.name, 'saint Augustin');
  assert.equal(result[0].depicted[0].artists_id.name, 'saint Jean');
  assert.equal(result[0].title, 'Saint Augustin');
  assert.equal(result[0].author.slug, 'augustin');
  assert.equal(input[0].author.name, 'Augustin');
  assert.deepEqual(withPersonTitles(result), result);
});
