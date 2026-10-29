import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { findNoteBibleReferences as refs, isBibleReferenceOnly as pure } from '../../src/lib/reader/bible-references.ts';
import { readBiblePassage } from '../../src/lib/bible-query.ts';
import { bibleTargets } from '../../src/lib/reader/bible-concordance.ts';
import { catholicBibleBookTitle, biblePassageLocation } from '../../src/lib/reader/bible-heading.ts';
import { readerBibleProfile, bibleContextForSource } from '../../src/lib/reader/bible-profile.ts';

test('ne transforme pas les élisions françaises et numéros de verset en chapitres', () => {
  for (const text of ['est l’époux', "est l'époux", 'Si l’on répond', "Si l'on répond", 'le mal, c’est-à-dire', 'plus que Jean, 2. – toutefois', 'Est. L', 'Mal. C'])
    assert.deepEqual(refs(text), [], text);
  assert.equal(refs('(Philip. II, 6-11)')[0].label, 'Ph 2:6–11');
  assert.equal(refs('Ps. xxi ; Is. liii').length, 2);
  assert.equal(refs('Jean, II, 1')[0].label, 'Jn 2:1');
});

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
    ['Eccl. 1:2.', 'Qo 1:2', 'ECC'],
    ['Eccl. 1:8.', 'Qo 1:8', 'ECC'],
    ['Eccl. 8:22.', 'Si 8:22', 'SIR'],
    ['Ps. II, v. 10.', 'Ps. 2:10', 'PSA'],
    ['Lc. 1,4', 'Lc 1:4', 'LUK'],
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
  assert.equal(refs(s)[0].book, 'ECC');
  assert.equal(pure(s, refs(s)), true);
  assert.equal(refs('Ps. li, 12.', { psalms: 'hebrew' })[0].numbering, 'hebrew');
  assert.equal(refs('Jean 19, 15.', { psalms: 'hebrew' })[0].book, 'JHN');
});

test('concordance des psaumes : références explicites, chapitres fusionnés et séparés', () => {
  const targets = text => bibleTargets(refs(text, { psalms: 'hebrew' })[0]);
  assert.deepEqual(targets('Ps. civ, 6.'), [{ book: 'PSA', chapter: 103, ranges: [{ first: 6, last: 6 }] }]);
  assert.deepEqual(targets('Ps. xvi (héb.) 10.'), [{ book: 'PSA', chapter: 15, ranges: [{ first: 10, last: 10 }] }]);
  assert.deepEqual(targets('Ps. 10:1.'), [{ book: 'PSA', chapter: 9, ranges: [{ first: 22, last: 22 }] }]);
  assert.deepEqual(targets('Ps. 115:1.'), [{ book: 'PSA', chapter: 113, ranges: [{ first: 9, last: 9 }] }]);
  assert.deepEqual(targets('Ps. 116:8–12.'), [
    { book: 'PSA', chapter: 114, ranges: [{ first: 8, last: 9 }] },
    { book: 'PSA', chapter: 115, ranges: [{ first: 1, last: 3 }] },
  ]);
  assert.deepEqual(targets('Ps. 147:12–20.'), [{ book: 'PSA', chapter: 147, ranges: [{ first: 1, last: 9 }] }]);
  assert.deepEqual(targets('Ps. 11:1–2.'), [{ book: 'PSA', chapter: 10, ranges: [{ first: 1, last: 3 }] }]);
  assert.equal(refs('Ps. xxi ; Is. liii')[0].ranges.length, 0);
  assert.equal(refs('Ps. 103 (Vulg.), 6.', { psalms: 'hebrew' })[0].numbering, 'vulgate');
  assert.deepEqual(targets('Ps. 68 (67), 19.'), [{ book: 'PSA', chapter: 67, ranges: [{ first: 19, last: 19 }] }]);
  assert.deepEqual(targets('Joël 3:1.'), [{ book: 'JOL', chapter: 2, ranges: [{ first: 28, last: 28 }] }]);
  assert.deepEqual(targets('Mal. 3:23–24.'), [{ book: 'MAL', chapter: 4, ranges: [{ first: 5, last: 6 }] }]);
});

test('le profil de chaque Bible et le contexte des notes restent explicites', () => {
  const profile = readerBibleProfile('70b9ede4-bffe-4558-b98d-6dff010686cc');
  assert.equal(profile.translation, 'CRA');
  const nt = bibleContextForSource(profile, '/OPS/literae-notes/p056-001-123.xhtml');
  assert.equal(nt.psalms, 'vulgate');
  assert.equal(refs('Ps. xxi.', nt)[0].numbering, 'vulgate');
  assert.equal(refs('Ps. xvi (héb.) 10.', nt)[0].numbering, 'hebrew');
  assert.equal(refs('I Rois, xiii, 14.', nt)[0].book, '1SA');
  assert.equal(readerBibleProfile('94e52d29-20a5-47eb-bbad-ae90633c1534').translation, 'GLA');
  assert.equal(readerBibleProfile('86f0f9de-c72d-418a-97c5-df9bffc9d83f').translation, 'SAC');
});

test('le titre catholique complet distingue les livres et les auteurs des épîtres', () => {
  assert.equal(catholicBibleBookTitle('JHN'), 'Évangile de saint Jean');
  assert.equal(catholicBibleBookTitle('1JN'), 'Première épître de saint Jean');
  assert.equal(catholicBibleBookTitle('1CO'), 'Première épître de saint Paul aux Corinthiens');
  assert.equal(catholicBibleBookTitle('2TH'), 'Deuxième épître de saint Paul aux Thessaloniciens');
  assert.equal(catholicBibleBookTitle('ECC'), 'Livre de l’Ecclésiaste');
  assert.equal(catholicBibleBookTitle('SIR'), 'Livre de l’Ecclésiastique');
  assert.equal(catholicBibleBookTitle('1SA'), 'Premier livre de Samuel');
  assert.equal(catholicBibleBookTitle('1KI'), 'Premier livre des Rois');
});

test('le sous-titre décrit un verset, une plage, une liste ou les chapitres entiers', () => {
  const location = (text, whole = false, context = {}) => biblePassageLocation(bibleTargets(refs(text, context)[0]), whole);
  assert.equal(location('Jn 8:12'), 'Chapitre 8, verset 12.');
  assert.equal(location('Jn 8:8–12'), 'Chapitre 8, versets 8 à 12.');
  assert.equal(location('Jn 8:8–12', true), 'Chapitre 8.');
  assert.equal(location('Jn 8'), 'Chapitre 8.');
  assert.equal(location('Ap 22:17, 20'), 'Chapitre 22, versets 17 et 20.');
  assert.equal(location('Jn 8:1–3, 5, 8–12'), 'Chapitre 8, versets 1 à 3, 5 et 8 à 12.');
  assert.equal(location('Ps 116:8–12', false, { psalms: 'hebrew' }), 'Chapitre 114, versets 8 à 9 ; chapitre 115, versets 1 à 3.');
  assert.equal(location('Ps 116:8–12', true, { psalms: 'hebrew' }), 'Chapitres 114 et 115.');
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
