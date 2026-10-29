import type { NoteBibleReference, VerseRange } from './bible-references';

export type BibleTarget = { book: string; chapter: number; ranges: VerseRange[] };

/** Hebrew Psalm numbers -> the Vulgate chapter order used by bible.db.
 * The split/merged verses below follow the Crampon text actually in the database,
 * checked against the EPUB (2,306 unique exact verse matches, plus split/merged text).
 * This is not a universal "subtract one" rule or an alteration of source labels.
 */
function psalmVerse(ch: number, v: number): [number, number][] {
  if (ch === 10) return [[9, v + 21]];
  if (ch === 11) return v === 1 ? [[10, 1], [10, 2]] : [[10, v + 1]];
  if (ch === 13) return v <= 2 ? [[12, 1]] : v === 3 ? [[12, 2], [12, 3]] : [[12, v]];
  if (ch === 44 && v >= 23) return [[43, v - 1]];
  if (ch === 56 && v >= 12) return [[55, v - 1]];
  if (ch >= 11 && ch <= 113) return [[ch - 1, v]];
  if (ch === 114) return [[113, v]];
  if (ch === 115) return [[113, v + 8]];
  if (ch === 116) return v <= 9 ? [[114, v]] : [[115, v - 9]];
  if (ch >= 117 && ch <= 146) return [[ch - 1, v]];
  if (ch === 147) return v <= 11 ? [[146, v]] : [[147, v - 11]];
  return [[ch, v]];
}

export function bibleTargets(ref: NoteBibleReference): BibleTarget[] {
  if (!ref.book) return [];
  if (ref.numbering !== 'hebrew' || !['PSA', 'JOL', 'MAL'].includes(ref.book)) return [{ book: ref.book, chapter: ref.chapter, ranges: ref.ranges }];
  const mapVerse = (verse: number): [number, number][] => {
    if (ref.book === 'JOL') return ref.chapter === 3 ? [[2, verse + 27]] : ref.chapter === 4 ? [[3, verse]] : [[ref.chapter, verse]];
    if (ref.book === 'MAL') return ref.chapter === 3 && verse > 18 ? [[4, verse - 18]] : [[ref.chapter, verse]];
    return psalmVerse(ref.chapter, verse);
  };
  if (!ref.ranges.length) {
    if (ref.book === 'JOL' && ref.chapter === 3) return [{ book: 'JOL', chapter: 2, ranges: [{ first: 28, last: 32 }] }];
    if (ref.book === 'MAL' && ref.chapter === 3) return [{ book: 'MAL', chapter: 3, ranges: [] }, { book: 'MAL', chapter: 4, ranges: [] }];
    if (ref.book !== 'PSA') return [{ book: ref.book, chapter: mapVerse(1)[0][0], ranges: [] }];
    const chapters = ref.chapter === 116 ? [114, 115] : ref.chapter === 147 ? [146, 147] : [psalmVerse(ref.chapter, 1)[0][0]];
    return chapters.map(chapter => ({ book: 'PSA', chapter, ranges: [] }));
  }
  const verses = new Map<number, Set<number>>();
  for (const range of ref.ranges) for (let v = range.first; v <= range.last; v++) {
    for (const [chapter, verse] of mapVerse(v)) {
      if (!verses.has(chapter)) verses.set(chapter, new Set());
      verses.get(chapter)!.add(verse);
    }
  }
  return [...verses].map(([chapter, values]) => {
    const ranges: VerseRange[] = [];
    for (const verse of [...values].sort((a, b) => a - b)) {
      const previous = ranges.at(-1);
      if (previous && verse === previous.last + 1) previous.last = verse;
      else ranges.push({ first: verse, last: verse });
    }
    return { book: ref.book!, chapter, ranges };
  });
}
