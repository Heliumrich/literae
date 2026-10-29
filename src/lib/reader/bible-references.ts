/** Historical French/Latin citations in notes. Source EPUBs are never rewritten. */
export type VerseRange = { first: number; last: number };
export type NoteBibleReference = {
  start: number; end: number; book: string | null; chapter: number;
  ranges: VerseRange[]; label: string; numbering?: 'hebrew' | 'vulgate';
};
export type NoteBibleContext = {
  translation?: string; psalms?: 'hebrew' | 'vulgate'; modernKings?: boolean;
  noteHeadings?: 'crampon' | 'glaire';
};

// Keep this vocabulary separate from the comparator's free-form search. In
// particular, Regum I–IV means Samuel I–II / Kings I–II, not modern Kings I–IV.
const BOOKS: [string, string, string][] = [
  ['GEN', 'Gen.', 'gen|genes|genèse|genese|genesis'],
  ['EXO', 'Ex.', 'ex|exod|exode|exodus'],
  ['LEV', 'Lév.', 'lev|lév|levit|lévit|lévitique|levitique|lv'],
  ['NUM', 'Nb', 'num|numb|nombr|nombres|nb'],
  ['DEU', 'Dt', 'deut|deuter|deuteron|deuteronom|deutéronome|deuteronome|dt|dr'],
  ['JOS', 'Jos.', 'jos|josué|josue'], ['JDG', 'Jg', 'jug|judic|juges|jg'],
  ['RUT', 'Rt', 'ruth|rut|rt'], ['JOB', 'Job', 'job'],
  ['1SA', '1 S', '1 sam|1 samuel|1 reg|1 regum'],
  ['2SA', '2 S', '2 sam|2 samuel|2 reg|2 regum'],
  ['1SA', '1 S', '1 rois'], ['2SA', '2 S', '2 rois'],
  ['1KI', '1 R', '3 rois|3 reg|3 regum'], ['2KI', '2 R', '4 rois|4 reg|4 regum'],
  ['1CH', '1 Ch', '1 chron|1 chroniques|1 par|1 paral|1 paralip|1 paralipom|1 paralipomènes'],
  ['2CH', '2 Ch', '2 chron|2 chroniques|2 par|2 paral|2 paralip|2 paralipom|2 paralipomènes'],
  ['EZR', 'Esd.', 'esd|esdr|esdras|1 esdr|1 esdras'], ['NEH', 'Néh.', 'neh|néh|néhémie|nehemie|2 esdr|2 esdras'],
  ['TOB', 'Tb', 'tob|tobie|tb'], ['JDT', 'Jdt', 'judith|judit|jdt'],
  ['EST', 'Est.', 'est|esth|esther'], ['PSA', 'Ps.', 'ps|psal|psalm|psaume|psaumes'],
  ['PRO', 'Pr', 'prov|proverb|proverbes|pr'],
  ['ECC', 'Qo', 'ecclésiaste|ecclesiaste|qo|qoh|qohélet|qohelet'],
  ['SNG', 'Ct', 'cant|cantique|cantique des cantiques|ct'],
  ['WIS', 'Sg', 'sap|sapient|sag|sagesse|sg'],
  ['SIR', 'Si', 'eccli|ecclesiast|ecclesiastique|ecclésiastique|sir|siracide|si'],
  ['', 'Eccl.', 'eccl|eccles'], // Resolve by the edition's abbreviation convention and verse bounds.
  ['ISA', 'Is.', 'is|isa|isaïe|isaie'], ['JER', 'Jr', 'jer|jér|jerem|jérém|jérémie|jeremie'],
  ['LAM', 'Lm', 'lam|lament|lamentations|lm'], ['BAR', 'Ba', 'bar|baruch|ba'],
  ['EZK', 'Ez', 'ez|éz|ezech|ezéch|ézéch|ézéchiel|ezechiel'],
  ['DAN', 'Dn', 'dan|daniel|dn'], ['HOS', 'Os.', 'os|osee|osée'],
  ['JOL', 'Jl', 'joel|joël|jl'], ['AMO', 'Am.', 'am|amos'],
  ['OBA', 'Abd.', 'abd|abdias'], ['JON', 'Jon.', 'jon|jonas'],
  ['MIC', 'Mi', 'mich|michée|michee|mi'], ['NAM', 'Na', 'nah|nahum|na'],
  ['HAB', 'Ha', 'hab|habac|habacuc|ha'], ['ZEP', 'So', 'soph|sophonie|so'],
  ['HAG', 'Ag', 'agg|aggée|aggee|ag'], ['ZEC', 'Za', 'zach|zacharie|za'],
  ['MAL', 'Ml', 'mal|malach|malachie|ml'],
  ['1MA', '1 M', '1 mach|1 macch|1 macc|1 maccabées|1 maccabees'],
  ['2MA', '2 M', '2 mach|2 macch|2 macc|2 maccabées|2 maccabees'],
  ['MAT', 'Mt', 'mat|matt|matth|matthieu|mt'], ['MRK', 'Mc', 'marc|mc'],
  ['LUK', 'Lc', 'luc|lc'], ['JHN', 'Jn', 'joan|joann|jean|jn'],
  ['ACT', 'Ac', 'act|actes|ac'], ['ROM', 'Rm', 'rom|romains|rm|ro'],
  ['1CO', '1 Cor.', '1 cor|1 corinth|1 corinthiens'],
  ['2CO', '2 Cor.', '2 cor|2 corinth|2 corinthiens'],
  ['GAL', 'Ga', 'gal|galat|galates|ga'],
  ['EPH', 'Éph.', 'eph|éph|ephes|éphés|éphésiens|ephesiens'],
  ['PHP', 'Ph', 'phil|philip|philipp|philippiens|ph'], ['COL', 'Col.', 'col|coloss|colossiens'],
  ['1TH', '1 Th', '1 thes|1 thess|1 thessal|1 thessaloniciens|1 th'],
  ['2TH', '2 Th', '2 thes|2 thess|2 thessal|2 thessaloniciens|2 th'],
  ['1TI', '1 Tm', '1 tim|1 timoth|1 timothée|1 timothee|1 tm'],
  ['2TI', '2 Tm', '2 tim|2 timoth|2 timothée|2 timothee|2 tm'],
  ['TIT', 'Tt', 'tit|tite|tt'], ['PHM', 'Phm', 'philem|philémon|philemon|phm'],
  ['HEB', 'He', 'heb|héb|hebr|hébr|hébreux|hebreux|he'],
  ['JAS', 'Jc', 'jac|jacob|jacq|jacques|jc'],
  ['1PE', '1 P', '1 pet|1 petr|1 pierre|1 p'], ['2PE', '2 P', '2 pet|2 petr|2 pierre|2 p'],
  ['1JN', '1 Jn', '1 joan|1 joann|1 jean|1 jn'],
  ['2JN', '2 Jn', '2 joan|2 joann|2 jean|2 jn'],
  ['3JN', '3 Jn', '3 joan|3 joann|3 jean|3 jn'],
  ['JUD', 'Jude', 'jude'], ['REV', 'Ap', 'apoc|apocal|apocalypse|ap'],
];
const ordinals: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 };
// Catholic canon, allowing either Hebrew or Vulgate chapter divisions.
const chapters: Record<string, number> = {
  GEN: 50, EXO: 40, LEV: 27, NUM: 36, DEU: 34, JOS: 24, JDG: 21, RUT: 4,
  '1SA': 31, '2SA': 24, '1KI': 22, '2KI': 25, '1CH': 29, '2CH': 36,
  EZR: 10, NEH: 13, TOB: 14, JDT: 16, EST: 16, '1MA': 16, '2MA': 15,
  JOB: 42, PSA: 150, PRO: 31, ECC: 12, SNG: 8, WIS: 19, SIR: 51,
  ISA: 66, JER: 52, LAM: 5, BAR: 6, EZK: 48, DAN: 14, HOS: 14, JOL: 4,
  AMO: 9, OBA: 1, JON: 4, MIC: 7, NAM: 3, HAB: 3, ZEP: 3, HAG: 2, ZEC: 14, MAL: 4,
  MAT: 28, MRK: 16, LUK: 24, JHN: 21, ACT: 28, ROM: 16, '1CO': 16, '2CO': 13,
  GAL: 6, EPH: 6, PHP: 4, COL: 4, '1TH': 5, '2TH': 3, '1TI': 6, '2TI': 4,
  TIT: 3, PHM: 1, HEB: 13, JAS: 5, '1PE': 5, '2PE': 3, '1JN': 5, '2JN': 1, '3JN': 1, JUD: 1, REV: 22,
};
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f.]/g, '').toLowerCase()
  .replace(/\s+/g, ' ').trim().replace(/^(iv|iii|ii|i)\s+/, n => `${ordinals[n.trim()]} `);
const aliases = new Map<string, { book: string; label: string }>();
const patterns: string[] = [];
for (const [book, label, list] of BOOKS) for (const alias of [...list.split('|'), label.replaceAll('.', '')]) {
  aliases.set(fold(alias), { book, label });
  patterns.push(alias.replace(/^[1-4] /, n => `(?:${n.trim()}|${['', 'I', 'II', 'III', 'IV'][Number(n)]})\\.?\\s*`).replaceAll(' ', '\\s+'));
}
const numeral = '(?:[0-9]+|[ivxlcdm]+)';
const range = '\\d+(?:\\s*[-–]\\s*\\d+)?';
const verses = `${range}(?:\\s*(?:,\\s*(?:et\\s+)?|et\\s+|&\\s*)${range})*`;
const inline = (pattern: string) => pattern.replaceAll('\\s', '[^\\S\\r\\n]');
const marker = '\\((?:(?:h[eé]b(?:r(?:eu)?)?|vulg(?:ate)?|lxx)\\.?|\\d+)\\)';
const citation = new RegExp(inline(`(?<![\\p{L}\\p{N}])(${patterns.sort((a, b) => b.length - a.length).join('|')})\\.?(?![\\p{L}])\\s*,?\\s*(${numeral})(?![\\p{L}\\p{N}])(?:\\s*(${marker}))?(?:\\s*[,.:]\\s*(?:v{1,2}\\.?\\s*)?(${verses})|(?<=\\))\\s*(${verses}))?`), 'giu');
const continuation = new RegExp(inline(`^\\s*;\\s*(${numeral})\\s*[,.:]\\s*(?:v{1,2}\\.?\\s*)?(${verses})(?![\\p{L}\\p{N}])`), 'iu');

function number(raw: string): number | null {
  if (/^\d+$/.test(raw)) return Number(raw);
  const s = raw.toUpperCase();
  if (!/^(?=.)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(s)) return null;
  const digits: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  return [...s].reduce((sum, c, i) => sum + (digits[c] < (digits[s[i + 1]] || 0) ? -digits[c] : digits[c]), 0);
}

function makeReference(start: number, end: number, name: { book: string; label: string }, ch: string, raw: string): NoteBibleReference | null {
  const chapter = number(ch);
  if (!chapter || chapter > 150) return null;
  const ranges: VerseRange[] = [];
  for (const segment of raw ? raw.split(/\s*(?:,\s*(?:et\s+)?|\bet\b|&)\s*/i) : []) {
    const [first, end] = segment.split(/\s*[-–]\s*/).map(Number), last = end ?? first;
    if (!Number.isInteger(first) || first < 1 || last < first || last > 176) return null;
    const previous = ranges.at(-1);
    if (previous && first === previous.last + 1) previous.last = last;
    else ranges.push({ first, last });
  }
  let { book, label } = name;
  // Eccl. normally means Ecclesiastes; Eccli. means Ecclesiasticus.
  // Some editions shorten both to Eccl. Impossible Qoheleth references (8:22,
  // 40:1, ...) identify Sirach instead. Bounds are those of the Vulgate.
  const ecclesiastes = [18, 26, 22, 17, 19, 12, 30, 17, 18, 20, 10, 14];
  if (!book) {
    book = chapter <= 12 && ranges.every(r => r.last <= ecclesiastes[chapter - 1]) ? 'ECC' : chapter <= 51 ? 'SIR' : '';
    label = book === 'ECC' ? 'Qo' : book === 'SIR' ? 'Si' : label;
  }
  if (book && chapter > chapters[book]) return null;
  return { start, end, book: book || null, chapter, ranges,
    label: `${label} ${chapter}${ranges.length ? ':' + ranges.map(r => r.first === r.last ? r.first : `${r.first}–${r.last}`).join(', ') : ''}` };

}

/** Only explicit references: no guessing an isolated Ib./Ibid. across footnotes. */
export function findNoteBibleReferences(text: string, context: NoteBibleContext = {}): NoteBibleReference[] {
  const found: NoteBibleReference[] = [];
  citation.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = citation.exec(text))) {
    // A French elision is never a chapter: “Si l’on”, “est l’époux”, “mal, c’est”.
    if (/^[’']/.test(text.slice(citation.lastIndex))) continue;
    // A name followed by a verse number at the next sentence is not a
    // chapter-only reference (“plus que Jean, 2. – toutefois…”).
    if (!match[4] && !match[5] && /^,\s*\d+$/.test(match[0].slice(match[1].length))) continue;
    // A cross-chapter range must not become a different, same-chapter range.
    if (/^\s*(?::\s*\d|[-–]\s*\d)/.test(text.slice(citation.lastIndex))) continue;
    let name = aliases.get(fold(match[1]));
    if (!name) continue;
    // For example, III Esdras is an apocryphon, not a bare Esdras reference.
    if (/\b(?:[IVX]+\.?|[1-4])[ \t\u00a0]+$/i.test(text.slice(0, match.index))) continue;
    if (context.modernKings && /^[12] rois$/.test(fold(match[1]))) {
      const n = Number(fold(match[1])[0]); name = { book: `${n}KI`, label: `${n} R` };
    }
    const ref = makeReference(match.index, citation.lastIndex, name, match[2], match[4] || match[5] || '');
    if (!ref) continue;
    if (ref.book === 'PSA' || ref.book === 'JOL' || ref.book === 'MAL') {
      const alternate = match[3]?.match(/\d+/);
      ref.numbering = alternate ? Number(alternate[0]) < ref.chapter ? 'hebrew' : 'vulgate'
        : match[3] ? /h[eé]b/i.test(match[3]) ? 'hebrew' : 'vulgate' : context.psalms || 'vulgate';
      if (ref.numbering === 'hebrew') ref.label += ' (héb.)';
    }
    found.push(ref);
    let next: RegExpExecArray | null;
    while ((next = continuation.exec(text.slice(citation.lastIndex)))) {
      const offset = citation.lastIndex + next[0].indexOf(next[1]);
      const end = citation.lastIndex + next[0].length;
      if (/^\s*(?::\s*\d|[-–]\s*\d)/.test(text.slice(end))) break;
      const more = makeReference(offset, end, name, next[1], next[2]);
      if (!more) break;
      more.numbering = ref.numbering;
      if (more.numbering === 'hebrew') more.label += ' (héb.)';
      found.push(more);
      citation.lastIndex = end;
    }
  }
  return found;
}

export function isBibleReferenceOnly(text: string, refs: NoteBibleReference[]): boolean {
  if (!refs.length || refs.some(ref => !ref.book)) return false;
  let rest = text;
  for (const ref of [...refs].reverse()) rest = rest.slice(0, ref.start) + rest.slice(ref.end);
  return /^[\s.,;:()[\]–\-]*$/.test(rest);
}
