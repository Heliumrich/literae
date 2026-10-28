type BookDef = {
  code: string;
  title: string;
  aliases: string[];
};

/** Une entrée par livre : code base, titre FR, formes acceptées (déjà sans accents). */
const BOOKS: BookDef[] = [
  { code: "GEN", title: "Genèse", aliases: ["genese", "genesis", "gn", "gen", "ge"] },
  { code: "EXO", title: "Exode", aliases: ["exode", "exodus", "ex", "exo"] },
  { code: "LEV", title: "Lévitique", aliases: ["levitique", "leviticus", "lv", "lev", "le"] },
  { code: "NUM", title: "Nombres", aliases: ["nombres", "numbers", "nb", "nm", "num", "nu"] },
  { code: "DEU", title: "Deutéronome", aliases: ["deuteronome", "deuteronomy", "dt", "deu", "deut", "de"] },
  { code: "JOS", title: "Josué", aliases: ["josue", "joshua", "jos", "js"] },
  { code: "JDG", title: "Juges", aliases: ["juges", "judges", "jg", "jdc", "jdg", "judg"] },
  { code: "RUT", title: "Ruth", aliases: ["ruth", "rt", "ru", "rut"] },
  { code: "1SA", title: "1 Samuel", aliases: ["1 samuel", "1samuel", "1sa", "1sam", "1s", "i samuel"] },
  { code: "2SA", title: "2 Samuel", aliases: ["2 samuel", "2samuel", "2sa", "2sam", "2s", "ii samuel"] },
  { code: "1KI", title: "1 Rois", aliases: ["1 rois", "1rois", "1ki", "1kgs", "1r", "1 kings", "1kings", "i rois"] },
  { code: "2KI", title: "2 Rois", aliases: ["2 rois", "2rois", "2ki", "2kgs", "2r", "2 kings", "2kings", "ii rois"] },
  { code: "1CH", title: "1 Chroniques", aliases: ["1 chroniques", "1chroniques", "1ch", "1chr", "1 chronicles", "1chronicles"] },
  { code: "2CH", title: "2 Chroniques", aliases: ["2 chroniques", "2chroniques", "2ch", "2chr", "2 chronicles", "2chronicles"] },
  { code: "EZR", title: "Esdras", aliases: ["esdras", "ezra", "esr", "ezr", "esd"] },
  { code: "NEH", title: "Néhémie", aliases: ["nehemie", "nehemiah", "neh", "ne"] },
  { code: "TOB", title: "Tobie", aliases: ["tobie", "tobit", "tb", "tob"] },
  { code: "JDT", title: "Judith", aliases: ["judith", "jdt"] },
  { code: "EST", title: "Esther", aliases: ["esther", "est"] },
  { code: "1MA", title: "1 Maccabées", aliases: ["1 maccabees", "1maccabees", "1mac", "1ma", "1m", "i maccabees"] },
  { code: "2MA", title: "2 Maccabées", aliases: ["2 maccabees", "2maccabees", "2mac", "2ma", "2m", "ii maccabees"] },
  { code: "JOB", title: "Job", aliases: ["job", "jb"] },
  { code: "PSA", title: "Psaumes", aliases: ["psaumes", "psaume", "psalms", "psalm", "ps", "psa", "pss"] },
  { code: "PRO", title: "Proverbes", aliases: ["proverbes", "proverbs", "pr", "prv", "prov", "pro"] },
  { code: "ECC", title: "Ecclésiaste", aliases: ["ecclesiaste", "ecclesiastes", "qoheleth", "qoh", "qo", "eccl", "ecc", "ecl"] },
  { code: "SNG", title: "Cantique des cantiques", aliases: ["cantique des cantiques", "cantique", "song of songs", "song of solomon", "cant", "ct", "sng", "ss"] },
  { code: "WIS", title: "Sagesse", aliases: ["sagesse", "wisdom", "sap", "sg", "wis", "ws"] },
  { code: "SIR", title: "Siracide", aliases: ["ecclesiastique", "siracide", "sirach", "sir", "si"] },
  { code: "ISA", title: "Isaïe", aliases: ["isaie", "isaiah", "is", "isa"] },
  { code: "JER", title: "Jérémie", aliases: ["jeremie", "jeremiah", "jr", "jer"] },
  { code: "LAM", title: "Lamentations", aliases: ["lamentations", "lam", "lm"] },
  { code: "BAR", title: "Baruch", aliases: ["baruch", "ba", "bar"] },
  { code: "EZK", title: "Ézéchiel", aliases: ["ezechiel", "ezekiel", "ez", "ezk", "eze"] },
  { code: "DAN", title: "Daniel", aliases: ["daniel", "dn", "dan", "da"] },
  { code: "HOS", title: "Osée", aliases: ["osee", "hosea", "os", "hos", "ho"] },
  { code: "JOL", title: "Joël", aliases: ["joel", "jl", "jol", "joe"] },
  { code: "AMO", title: "Amos", aliases: ["amos", "am", "amo"] },
  { code: "OBA", title: "Abdias", aliases: ["abdias", "obadiah", "abd", "ob", "oba"] },
  { code: "JON", title: "Jonas", aliases: ["jonas", "jonah", "jon"] },
  { code: "MIC", title: "Michée", aliases: ["michee", "micah", "mi", "mic", "mch"] },
  { code: "NAM", title: "Nahum", aliases: ["nahum", "na", "nam", "nah"] },
  { code: "HAB", title: "Habacuc", aliases: ["habacuc", "habakkuk", "ha", "hab"] },
  { code: "ZEP", title: "Sophonie", aliases: ["sophonie", "zephaniah", "so", "soph", "zep", "zp"] },
  { code: "HAG", title: "Aggée", aliases: ["aggee", "haggai", "ag", "hag", "hg"] },
  { code: "ZEC", title: "Zacharie", aliases: ["zacharie", "zechariah", "za", "zach", "zec", "zc"] },
  { code: "MAL", title: "Malachie", aliases: ["malachie", "malachi", "ml", "mal"] },
  { code: "MAT", title: "Matthieu", aliases: ["matthieu", "matthew", "mt", "matt", "mat"] },
  { code: "MRK", title: "Marc", aliases: ["marc", "mark", "mc", "mr", "mrk", "mk"] },
  { code: "LUK", title: "Luc", aliases: ["luc", "luke", "lc", "lk", "luk"] },
  { code: "JHN", title: "Jean", aliases: ["jean", "john", "jn", "jhn", "joh"] },
  { code: "ACT", title: "Actes", aliases: ["actes", "actes des apotres", "acts", "ac", "act"] },
  { code: "ROM", title: "Romains", aliases: ["romains", "romans", "rm", "ro", "rom"] },
  { code: "1CO", title: "1 Corinthiens", aliases: ["1 corinthiens", "1corinthiens", "1 corinthians", "1corinthians", "1co", "1cor"] },
  { code: "2CO", title: "2 Corinthiens", aliases: ["2 corinthiens", "2corinthiens", "2 corinthians", "2corinthians", "2co", "2cor"] },
  { code: "GAL", title: "Galates", aliases: ["galates", "galatians", "ga", "gal", "gl"] },
  { code: "EPH", title: "Éphésiens", aliases: ["ephesiens", "ephesians", "ep", "eph"] },
  { code: "PHP", title: "Philippiens", aliases: ["philippiens", "philippians", "ph", "php", "phil"] },
  { code: "COL", title: "Colossiens", aliases: ["colossiens", "colossians", "col"] },
  { code: "1TH", title: "1 Thessaloniciens", aliases: ["1 thessaloniciens", "1thessaloniciens", "1 thessalonians", "1thessalonians", "1th", "1thes", "1thess"] },
  { code: "2TH", title: "2 Thessaloniciens", aliases: ["2 thessaloniciens", "2thessaloniciens", "2 thessalonians", "2thessalonians", "2th", "2thes", "2thess"] },
  { code: "1TI", title: "1 Timothée", aliases: ["1 timothee", "1timothee", "1 timothy", "1timothy", "1tm", "1tim", "1ti"] },
  { code: "2TI", title: "2 Timothée", aliases: ["2 timothee", "2timothee", "2 timothy", "2timothy", "2tm", "2tim", "2ti"] },
  { code: "TIT", title: "Tite", aliases: ["tite", "titus", "tt", "tit"] },
  { code: "PHM", title: "Philémon", aliases: ["philemon", "phm", "phlm"] },
  { code: "HEB", title: "Hébreux", aliases: ["hebreux", "hebrews", "he", "heb", "hbr"] },
  { code: "JAS", title: "Jacques", aliases: ["jacques", "james", "jc", "jas", "jam", "ja"] },
  { code: "1PE", title: "1 Pierre", aliases: ["1 pierre", "1pierre", "1 peter", "1peter", "1p", "1pt", "1pe", "1pet"] },
  { code: "2PE", title: "2 Pierre", aliases: ["2 pierre", "2pierre", "2 peter", "2peter", "2p", "2pt", "2pe", "2pet"] },
  { code: "1JN", title: "1 Jean", aliases: ["1 jean", "1jean", "1 john", "1john", "1jn", "1jo"] },
  { code: "2JN", title: "2 Jean", aliases: ["2 jean", "2jean", "2 john", "2john", "2jn", "2jo"] },
  { code: "3JN", title: "3 Jean", aliases: ["3 jean", "3jean", "3 john", "3john", "3jn", "3jo"] },
  { code: "JUD", title: "Jude", aliases: ["jude", "jud"] },
  { code: "REV", title: "Apocalypse", aliases: ["apocalypse", "revelation", "revelations", "ap", "apc", "apo", "rev", "re"] },
];

const TITLE_BY_CODE = new Map(BOOKS.map((b) => [b.code, b.title]));
const CODE_BY_ALIAS = new Map<string, string>();

for (const book of BOOKS) {
  CODE_BY_ALIAS.set(book.code.toLowerCase(), book.code);
  CODE_BY_ALIAS.set(fold(book.title), book.code);
  CODE_BY_ALIAS.set(fold(book.title).replace(/\s+/g, ""), book.code);
  for (const alias of book.aliases) {
    CODE_BY_ALIAS.set(alias, book.code);
    CODE_BY_ALIAS.set(alias.replace(/\s+/g, ""), book.code);
  }
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeBook(input: string): string | null {
  if (!input) return null;
  const raw = fold(input);
  const found =
    CODE_BY_ALIAS.get(raw) ||
    CODE_BY_ALIAS.get(raw.replace(/\s+/g, "")) ||
    CODE_BY_ALIAS.get(raw.replace(/^(i|ii|iii)\s+/, (m) =>
      m.startsWith("iii") ? "3 " : m.startsWith("ii") ? "2 " : "1 ",
    ));
  return found ?? null;
}

export type ParsedRef = {
  book: string | null;
  chapter: number | null;
  verse: number | null;
  verseEnd: number | null;
};

export function parseReference(ref: string): ParsedRef {
  const empty: ParsedRef = { book: null, chapter: null, verse: null, verseEnd: null };
  if (!ref?.trim()) return empty;

  const text = ref.trim().replace(/\s+/g, " ");
  const patterns = [
    /^(.+?)\s+(\d+)\s*[:.,]\s*(\d+)\s*[-–\u2014àa]\s*(\d+)$/i,
    /^(.+?)\s+(\d+)\s*[:.,]\s*(\d+)$/i,
    /^(.+?)\s+(\d+)$/i,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (!m) continue;
    const start = m[3] ? parseInt(m[3], 10) : null;
    const end = m[4] ? parseInt(m[4], 10) : null;
    return {
      book: normalizeBook(m[1]),
      chapter: parseInt(m[2], 10),
      verse: start,
      verseEnd: start && end && end !== start ? Math.max(start, end) : null,
    };
  }
  return empty;
}

export function bookTitle(code: string) {
  return TITLE_BY_CODE.get(code) || code;
}

export function formatRefLabel(parsed: ParsedRef) {
  if (!parsed.book || !parsed.chapter) return "";
  const title = bookTitle(parsed.book);
  if (parsed.verse && parsed.verseEnd) {
    return `${title} ${parsed.chapter}:${parsed.verse}-${parsed.verseEnd}`;
  }
  if (parsed.verse) return `${title} ${parsed.chapter}:${parsed.verse}`;
  return `${title} ${parsed.chapter}`;
}
