import test from 'node:test';
import assert from 'node:assert/strict';
import { modernizeText } from '../../src/lib/reader/text.ts';
import { parseSettings, readerCss } from '../../src/lib/reader/preferences.ts';
import { lastEditionKey, legacyProgressForFile, parseProgress, progressKey } from '../../src/lib/reader/progress.ts';

test('ignore les réglages corrompus et borne la typographie', () => {
  assert.deepEqual(parseSettings(null), { font: 'site', size: 20, margin: 32, justify: false, hyphenate: true, modernize: true, palette: 'auto' });
  assert.deepEqual(parseSettings({ font: 'url(evil)', size: 999, margin: -2, palette: '__proto__', justify: true }),
    { font: 'site', size: 32, margin: 8, palette: 'auto', justify: true, hyphenate: true, modernize: true });
});
test('chaque UUID de fichier conserve son signet, sans tronquer les identifiants', () => {
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '11111111-1111-4111-8111-111111111112';
  const p = { cfi: 'epubcfi(/6/4!/4/2)', updated: 1 };
  assert.equal(progressKey(a), `literae-epub-progress-v2:${a}`);
  assert.notEqual(progressKey(a), progressKey(b));
  assert.notEqual(lastEditionKey('book-a'), lastEditionKey('book-b'));
  assert.deepEqual(parseProgress(p), p);
  assert.equal(parseProgress({ ...p, cfi: 'javascript:alert(1)' }), null);
  assert.equal(parseProgress({ ...p, updated: NaN }), null);
});
test('l’ancien signet est récupéré uniquement pour son EPUB d’origine', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const p = { edition: `/scriptorium/bibliotheque/fichiers/${id}-123abc456def.epub`, cfi: 'epubcfi(/6/4!/4/2)', updated: 1 };
  assert.deepEqual(legacyProgressForFile(p, id), { cfi: p.cfi, updated: p.updated });
  assert.equal(legacyProgressForFile(p, '11111111-1111-4111-8111-111111111112'), null);
  assert.equal(legacyProgressForFile({ ...p, edition: '/inconnu.epub' }, id), null);
});
test('le thème automatique suit le site et les polices supplémentaires sont conditionnelles', () => {
  const auto = parseSettings(null);
  assert.match(readerCss(auto, false, 'https://literae.ch'), /background: #f1eadc/);
  assert.match(readerCss(auto, true, 'https://literae.ch'), /background: #171513/);
  assert.doesNotMatch(readerCss(auto, false, 'https://literae.ch'), /reader-fonts/);
  const lora = readerCss({ ...auto, font: 'lora', palette: 'oled' }, false, 'https://literae.ch');
  assert.match(lora, /reader-fonts\/lora-latin-400-normal.woff2/);
  assert.doesNotMatch(lora, /reader-fonts\/(literata|libre-baskerville)/);
  assert.match(lora, /background: #000000 !important; color: #e7e1d7/);
});

test('la césure est active par défaut, y compris pour les anciens réglages, et peut être désactivée', () => {
  assert.equal(parseSettings({ justify: true }).hyphenate, true);
  const disabled = parseSettings({ hyphenate: false });
  assert.equal(disabled.hyphenate, false);
  assert.match(readerCss(disabled, false, 'https://literae.ch'), /hyphens: none !important/);
});

test('les s longs sont modernisés par défaut, sans changer les autres graphies ni les positions', () => {
  assert.equal(parseSettings({}).modernize, true);
  const original = 'Penſées : le deſſein et les ſujets.';
  assert.equal(modernizeText(original, true), 'Pensées : le dessein et les sujets.');
  assert.equal(modernizeText(original, true).length, original.length);
  assert.equal(modernizeText(original, false), original);
  assert.equal(parseSettings({ modernize: false }).modernize, false);
});
