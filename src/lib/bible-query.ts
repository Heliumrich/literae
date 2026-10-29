type VerseRow = {
  verse: number;
  text: string;
  code: string;
  name_short: string;
};

type CodeRow = { code: string };
type MaxRow = { value: number | null };
type NavTarget = { book: string; chapter: number; verse: number | null };
type Navigation = { prev: NavTarget | null; next: NavTarget | null };
/** Minimal adapter shared by better-sqlite3 on Node and sql.js in a worker. */
export type BibleReader = {
  prepare(sql: string): {
    all(...values: (string | number)[]): unknown[];
    get(...values: (string | number)[]): unknown;
  };
};

function getNavigation(
  db: BibleReader,
  book: string,
  chapter: number,
  verse: number | null,
): Navigation {
  const books = (db.prepare("SELECT code FROM books ORDER BY order_num").all() as CodeRow[])
    .map((row) => row.code);
  const bookIndex = books.indexOf(book);
  if (bookIndex === -1) return { prev: null, next: null };

  const maxChapter = (bookCode: string) =>
    (db
      .prepare("SELECT MAX(chapter) AS value FROM verses WHERE book = ?")
      .get(bookCode) as MaxRow | undefined)?.value || 1;

  const maxVerse = (bookCode: string, chapterNumber: number) =>
    (db
      .prepare("SELECT MAX(verse) AS value FROM verses WHERE book = ? AND chapter = ?")
      .get(bookCode, chapterNumber) as MaxRow | undefined)?.value || 1;

  let next: NavTarget | null = null;
  let prev: NavTarget | null = null;

  if (verse !== null) {
    const lastVerse = maxVerse(book, chapter);
    if (verse < lastVerse) {
      next = { book, chapter, verse: verse + 1 };
    } else if (chapter < maxChapter(book)) {
      next = { book, chapter: chapter + 1, verse: 1 };
    } else if (bookIndex + 1 < books.length) {
      next = { book: books[bookIndex + 1], chapter: 1, verse: 1 };
    }

    if (verse > 1) {
      prev = { book, chapter, verse: verse - 1 };
    } else if (chapter > 1) {
      const previousChapter = chapter - 1;
      prev = { book, chapter: previousChapter, verse: maxVerse(book, previousChapter) };
    } else if (bookIndex > 0) {
      const previousBook = books[bookIndex - 1];
      const previousChapter = maxChapter(previousBook);
      prev = {
        book: previousBook,
        chapter: previousChapter,
        verse: maxVerse(previousBook, previousChapter),
      };
    }
  } else {
    if (chapter < maxChapter(book)) {
      next = { book, chapter: chapter + 1, verse: null };
    } else if (bookIndex + 1 < books.length) {
      next = { book: books[bookIndex + 1], chapter: 1, verse: null };
    }

    if (chapter > 1) {
      prev = { book, chapter: chapter - 1, verse: null };
    } else if (bookIndex > 0) {
      const previousBook = books[bookIndex - 1];
      prev = { book: previousBook, chapter: maxChapter(previousBook), verse: null };
    }
  }

  return { prev, next };
}

export function readBiblePassage(db: BibleReader, params: URLSearchParams) {
  const book = params.get("book")?.toUpperCase();
  const chapter = Number(params.get("chapter"));
  const verse = params.get("verse") ? Number(params.get("verse")) : null;
  const verseEnd = params.get("verseEnd") ? Number(params.get("verseEnd")) : null;
  const translationCode = params.get('translation');
  const byCode = translationCode ? db.prepare('SELECT id FROM translations WHERE code = ?').get(translationCode.toUpperCase()) as { id: number } | undefined : undefined;
  const translationIds = [...new Set(byCode ? [byCode.id] : translationCode ? [] :
    params
      .getAll("t")
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0),
  )].slice(0, 4);

  if (!book || !Number.isInteger(chapter) || chapter < 1 || translationIds.length === 0) {
    throw new Error("Paramètres manquants");
  }

  const results = [];

  for (const translationId of translationIds) {
    let rows: VerseRow[];
    if (verse && verseEnd && verseEnd !== verse) {
      const from = Math.min(verse, verseEnd);
      const to = Math.max(verse, verseEnd);
      rows = db
        .prepare(
          `SELECT v.verse, v.text, t.code, t.name_short
           FROM verses v
           JOIN translations t ON t.id = v.translation_id
           WHERE v.translation_id = ? AND v.book = ? AND v.chapter = ? AND v.verse BETWEEN ? AND ?
           ORDER BY v.verse`,
        )
        .all(translationId, book, chapter, from, to) as VerseRow[];
    } else if (verse) {
      rows = db
        .prepare(
          `SELECT v.verse, v.text, t.code, t.name_short
           FROM verses v
           JOIN translations t ON t.id = v.translation_id
           WHERE v.translation_id = ? AND v.book = ? AND v.chapter = ? AND v.verse = ?
           ORDER BY v.verse`,
        )
        .all(translationId, book, chapter, verse) as VerseRow[];
    } else {
      rows = db
        .prepare(
          `SELECT v.verse, v.text, t.code, t.name_short
           FROM verses v
           JOIN translations t ON t.id = v.translation_id
           WHERE v.translation_id = ? AND v.book = ? AND v.chapter = ?
           ORDER BY v.verse`,
        )
        .all(translationId, book, chapter) as VerseRow[];
    }

    results.push({
      code: rows[0]?.code || "?",
      name: rows[0]?.name_short || `ID ${translationId}`,
      verses: rows.map((row) => ({ verse: row.verse, text: row.text })),
    });
  }

  const navigation = getNavigation(
    db,
    book,
    chapter,
    verse && !verseEnd ? verse : null,
  );

  return { book, chapter, verse, verseEnd, results, navigation };
}
