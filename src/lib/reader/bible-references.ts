/** Historical French/Latin citations in notes. Source EPUBs are never rewritten. */
export type VerseRange = { first: number; last: number };
export type NoteBibleReference = {
  start: number; end: number; book: string | null; chapter: number;
  ranges: VerseRange[]; label: string;
};
export type NoteBibleContext = { oldTestament?: 'vulgate' | 'unmapped' };

// Keep this vocabulary separate from the comparator's free-form search. In
// particular, Regum I–IV means Samuel I–II / Kings I–II, not modern Kings I–IV.
const BOOKS: [string, string, string][] = [
  ['GEN', 'Gen.', 'gen|genes|genèse|genese|genesis'],
  ['EXO', 'Ex.', 'ex|exod|exode|exodus'],
  ['LEV', 'Lév.', 'lev|lév|levit|lévit|lévitique|levitique|lv'],
  ['NUM', 'Nb', 'num|numb|nombr|nombres|nb'],
  ['DEU', 'Dt', 'deut|deuter|deuteron|deuteronom|deutéronome|deuteronome|dt'],
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
  ['', 'Eccl.', 'eccl|eccles'], // Abbreviates two different books in these editions.
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
  ['ACT', 'Ac', 'act|actes|ac'], ['ROM', 'Rm', 'rom|romains|rm'],
  ['1CO', '1 Cor.', '1 cor|1 corinth|1 corinthiens'],
  ['2CO', '2 Cor.', '2 cor|2 corinth|2 corinthiens'],
  ['GAL', 'Ga', 'gal|galat|galates|ga'],
  ['EPH', 'Ep', 'eph|éph|ephes|éphés|éphésiens|ephesiens|ep'],
  ['PHP', 'Ph', 'phil|philipp|philippiens|ph'], ['COL', 'Col.', 'col|coloss|colossiens'],
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
const citation = new RegExp(inline(`(?<![\\p{L}\\p{N}])(${patterns.sort((a, b) => b.length - a.length).join('|')})\\.?(?![\\p{L}])\\s*,?\\s*(${numeral})\\s*[,.:]\\s*(${verses})(?![\\p{L}\\p{N}])`), 'giu');
const continuation = new RegExp(inline(`^\\s*;\\s*(${numeral})\\s*[,.:]\\s*(${verses})(?![\\p{L}\\p{N}])`), 'iu');

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
  for (const segment of raw.split(/\s*(?:,\s*(?:et\s+)?|\bet\b|&)\s*/i)) {
    const [first, end] = segment.split(/\s*[-–]\s*/).map(Number), last = end ?? first;
    if (!Number.isInteger(first) || first < 1 || last < first || last > 176) return null;
    const previous = ranges.at(-1);
    if (previous && first === previous.last + 1) previous.last = last;
    else ranges.push({ first, last });
  }
  let { book, label } = name;
  // Eccl./Eccles. is ambiguous below chapter 13. Do not silently choose Qoheleth
  // or Sirach. Higher chapters necessarily refer to Ecclesiasticus (Sirach).
  if (!book && chapter > 12 && chapter <= 51) { book = 'SIR'; label = 'Si'; }
  return { start, end, book: book || null, chapter, ranges,
    label: `${label} ${chapter}:${ranges.map(r => r.first === r.last ? r.first : `${r.first}–${r.last}`).join(', ')}` };
}

/** Only explicit references: no guessing an isolated Ib./Ibid. across footnotes. */
export function findNoteBibleReferences(text: string, context: NoteBibleContext = {}): NoteBibleReference[] {
  const found: NoteBibleReference[] = [];
  citation.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = citation.exec(text))) {
    // A cross-chapter range must not become a different, same-chapter range.
    if (/^\s*(?::\s*\d|[-–]\s*\d)/.test(text.slice(citation.lastIndex))) continue;
    let name = aliases.get(fold(match[1]));
    if (!name) continue;
    // For example, III Esdras is an apocryphon, not a bare Esdras reference.
    if (/\b(?:[IVX]+\.?|[1-4])[ \t\u00a0]+$/i.test(text.slice(0, match.index))) continue;
    if (context.oldTestament === 'unmapped' && /^[12] rois$/.test(fold(match[1]))) {
      const n = Number(fold(match[1])[0]); name = { book: `${n}KI`, label: `${n} R` };
    }
    const ref = makeReference(match.index, citation.lastIndex, name, match[2], match[3]);
    if (!ref) continue;
    found.push(ref);
    let next: RegExpExecArray | null;
    while ((next = continuation.exec(text.slice(citation.lastIndex)))) {
      const offset = citation.lastIndex + next[0].indexOf(next[1]);
      const end = citation.lastIndex + next[0].length;
      if (/^\s*(?::\s*\d|[-–]\s*\d)/.test(text.slice(end))) break;
      const more = makeReference(offset, end, name, next[1], next[2]);
      if (!more) break;
      found.push(more);
      citation.lastIndex = end;
    }
  }
  if (context.oldTestament === 'unmapped') for (const ref of found) {
    if (ref.book && !/^(?:MAT|MRK|LUK|JHN|ACT|ROM|[12]CO|GAL|EPH|PHP|COL|[12]TH|[12]TI|TIT|PHM|HEB|JAS|[12]PE|[123]JN|JUD|REV)$/.test(ref.book)) ref.book = null;
  }
  return found;
}

export function isBibleReferenceOnly(text: string, refs: NoteBibleReference[]): boolean {
  if (!refs.length || refs.some(ref => !ref.book)) return false;
  let rest = text;
  for (const ref of [...refs].reverse()) rest = rest.slice(0, ref.start) + rest.slice(ref.end);
  return /^[\s.,;:()[\]–\-]*$/.test(rest);
}
