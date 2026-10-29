import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { findNoteBibleReferences as refs, isBibleReferenceOnly as pure } from '../../src/lib/reader/bible-references.ts';
import { readBiblePassage } from '../../src/lib/bible-query.ts';

test('normalise les références réelles, y compris les lettres latines et les livres numérotés', () => {
  for (const [source, label, book] of [
    ['I Cor., VIII, 1.', '1 Cor. 8:1', '1CO'],
    ['I. Joan., II, 16.', '1 Jn 2:16', '1JN'],
    ['II. Petr., II, 14.', '2 P 2:14', '2PE'],
    ['Joann., XIV, 30.', 'Jn 14:30', 'JHN'],
    ['Philipp., III, 8.', 'Ph 3:8', 'PHP'],
    ['Ps. lxxxiii, 5.', 'Ps. 83:5', 'PSA'],
    ['Jean 19, 15.', 'Jn 19:15', 'JHN'],
    ['1 Cor. 8:1-4', '1 Cor. 8:1–4', '1CO'],
    ['I. Reg., XV, 24.', '1 S 15:24', '1SA'],
    ['IV Reg. XVII, 7.', '2 R 17:7', '2KI'],
    ['1 Rois, 28, 7.', '1 S 28:7', '1SA'],
    ['2 Esdras, 9, 19.', 'Néh. 9:19', 'NEH'],
    ['Eccl., XL, 1.', 'Si 40:1', 'SIR'],
  ]) {
    const [ref] = refs(source);
    assert.equal(ref?.label, label, source); assert.equal(ref?.book, book, source);
    assert.equal(pure(source, [ref]), true, source);
  }
});

test('distingue listes, plages et changements de chapitre dans la même note', () => {
  assert.deepEqual(refs('Apoc., XXII, 17 et 20.')[0].ranges, [{ first: 17, last: 17 }, { first: 20, last: 20 }]);
  assert.deepEqual(refs('I Joan., II, 15, 16, 17.')[0].ranges, [{ first: 15, last: 17 }]);
  const s = 'Heb., XI, 35–38; XII, 1, 2.';
  assert.deepEqual(refs(s).map(r => r.label), ['He 11:35–38', 'He 12:1–2']);
  assert.equal(pure(s, refs(s)), true);
  assert.deepEqual(refs('Job, XIV, 10. Ps. CXLIII, 4.').map(r => r.label), ['Job 14:10', 'Ps. 143:4']);
});

test('le commentaire reste manuel, sans perdre le texte autour des renvois', () => {
  const s = 'Nous n’avons de roi que César. Jean 19, 15. (les notes de traduction sont de Wikisource)';
  const [ref] = refs(s);
  assert.equal(ref.label, 'Jn 19:15');
  assert.equal(s.slice(ref.start, ref.end), 'Jean 19, 15');
  assert.equal(pure(s, [ref]), false);
  assert.equal(pure('Cf. Ps. III, 7.', refs('Cf. Ps. III, 7.')), false);
});

test('ne devine pas les renvois ambigus, transchapitres, bibliographiques ou tronqués', () => {
  for (const s of ['Ibid., VIII, 21.', 'Conf., lib. II, cap. II.', 'S. Aug. de lib. arbitr., lib. III, cap. XXIV.', 'Plin. jun. Ep. 8. l.5.', 'III Esdr. ix, 16.', 'Jn 3:16–4:2', 'Jean\n3:16', 'Matth. IIX, 3.']) assert.deepEqual(refs(s), [], s);
  const s = 'Eccl., XI, 1.';
  assert.equal(refs(s)[0].book, null);
  assert.equal(pure(s, refs(s)), false);
  assert.equal(refs('Ps. li, 12.', { oldTestament: 'unmapped' })[0].book, null);
  assert.equal(refs('Jean 19, 15.', { oldTestament: 'unmapped' })[0].book, 'JHN');
});

test('l’API sélectionne Fillion par code stable, tout en gardant les ID du comparateur', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE translations (id INTEGER, code TEXT, name_short TEXT);
      CREATE TABLE books (code TEXT, order_num INTEGER);
      CREATE TABLE verses (translation_id INTEGER, book TEXT, chapter INTEGER, verse INTEGER, text TEXT);
      INSERT INTO translations VALUES (42, 'FIL', 'Bible Fillion'), (2, 'OTHER', 'Autre');
      INSERT INTO books VALUES ('1CO', 1);
      INSERT INTO verses VALUES (42, '1CO', 8, 1, 'Fillion'), (42, '1CO', 8, 2, 'Suite'), (2, '1CO', 8, 1, 'Autre');`);
    const byCode = readBiblePassage(db, new URLSearchParams('book=1CO&chapter=8&verse=1&translation=FIL'));
    assert.equal(byCode.results[0].code, 'FIL');
    assert.deepEqual(byCode.results[0].verses, [{ verse: 1, text: 'Fillion' }]);
    assert.equal(readBiblePassage(db, new URLSearchParams('book=1CO&chapter=8&t=2')).results[0].code, 'OTHER');
    assert.equal(readBiblePassage(db, new URLSearchParams('book=1CO&chapter=8&translation=FIL')).results[0].verses.length, 2);
    assert.throws(() => readBiblePassage(db, new URLSearchParams('book=1CO&chapter=8&translation=INCONNU')), /Paramètres/);
  } finally { db.close(); }
});
