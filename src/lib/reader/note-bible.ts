import { bookTitle } from '../bible-ref';
import { findNoteBibleReferences, isBibleReferenceOnly, type NoteBibleReference, type NoteBibleContext } from './bible-references';

type Verse = { verse: number; text: string };
const inReference = (verse: Verse, ref: NoteBibleReference) =>
  ref.ranges.some(range => verse.verse >= range.first && verse.verse <= range.last);
const blockTags = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'SECTION', 'ASIDE', 'TR', 'BR']);

/** Text offsets span inline markup, but never join two paragraphs into a citation. */
function textMap(root: HTMLElement) {
  let text = '';
  const nodes: { node: Text; start: number; end: number }[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const start = text.length;
      // XML source wrapping is whitespace, not a paragraph boundary. Keep one
      // character per character so Range offsets still address the real nodes.
      text += (node.textContent || '').replace(/[\r\n]/g, ' ');
      nodes.push({ node: node as Text, start, end: text.length });
    } else {
      const block = node instanceof Element && blockTags.has(node.tagName);
      if (block) text += '\n';
      for (const child of node.childNodes) walk(child);
      if (block) text += '\n';
    }
  };
  walk(root);
  return { text, nodes };
}

/** On-demand comparator passages, independent of EPUB note preloading and CFI. */
export class NoteBible {
  private controller = new AbortController();
  private cache = new Map<string, Verse[]>();
  private pending = new Map<string, Promise<Verse[]>>();
  private generation = 0;
  constructor(private context: NoteBibleContext = {}) {}

  reset() {
    this.generation++;
    this.controller.abort();
    this.controller = new AbortController();
    this.pending.clear();
  }
  destroy() { this.reset(); this.cache.clear(); }

  private url(ref: NoteBibleReference, range?: { first: number; last: number }) {
    // Stable translation code, never an ID that can change between DB releases.
    const params = new URLSearchParams({ book: ref.book!, chapter: String(ref.chapter), translation: 'FIL' });
    if (range) {
      params.set('verse', String(range.first));
      if (range.last !== range.first) params.set('verseEnd', String(range.last));
    }
    return `/api/bible/verses?${params}`;
  }

  private async fetchVerses(url: string): Promise<Verse[]> {
    const cached = this.cache.get(url);
    if (cached) return cached;
    const pending = this.pending.get(url);
    if (pending) return pending;
    const generation = this.generation;
    const task = (async () => {
      const response = await fetch(url, { signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) throw new Error('Passage indisponible');
      const data = await response.json();
      const result = data.results?.find((result: { code: string }) => result.code === 'FIL');
      if (!Array.isArray(result?.verses) || !result.verses.length || !result.verses.every((verse: Verse) =>
        Number.isInteger(verse.verse) && typeof verse.text === 'string')) throw new Error('Passage absent de Fillion');
      const verses: Verse[] = result.verses;
      if (generation === this.generation) {
        this.cache.set(url, verses);
        if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value!);
      }
      return verses;
    })();
    this.pending.set(url, task);
    try { return await task; }
    finally { if (this.pending.get(url) === task) this.pending.delete(url); }
  }

  private async passage(ref: NoteBibleReference, whole: boolean) {
    const chapterUrl = this.url(ref);
    const chapter = this.cache.get(chapterUrl);
    if (whole) return this.fetchVerses(chapterUrl);
    const verses = chapter || (await Promise.all(ref.ranges.map(range => this.fetchVerses(this.url(ref, range))))).flat();
    const selected = [...new Map(verses.filter(verse => inReference(verse, ref)).map(verse => [verse.verse, verse])).values()]
      .sort((a, b) => a.verse - b.verse);
    // Do not silently display only part of a malformed or unavailable range.
    for (const range of ref.ranges) for (let n = range.first; n <= range.last; n++)
      if (!selected.some(verse => verse.verse === n)) throw new Error('Verset absent');
    return selected;
  }

  enhance(body: HTMLElement) {
    const { text, nodes } = textMap(body);
    const refs = findNoteBibleReferences(text, this.context);
    const generation = this.generation;
    const automatic = isBibleReferenceOnly(text, refs);
    const panels = document.createElement('div');
    panels.className = 'reader-bible-passages';
    const activate: (() => void)[] = [];
    // Reverse replacement keeps offsets valid, including several refs in one node.
    for (const [index, ref] of [...refs.entries()].reverse()) {
      const first = nodes.find(n => n.start <= ref.start && n.end > ref.start);
      const last = nodes.find(n => n.start < ref.end && n.end >= ref.end);
      if (!first || !last) continue;
      // Never nest an interactive reference inside an existing EPUB hyperlink.
      if (nodes.some(n => n.start < ref.end && n.end > ref.start && n.node.parentElement?.closest('a[href]'))) continue;
      const range = document.createRange();
      range.setStart(first.node, ref.start - first.start);
      range.setEnd(last.node, ref.end - last.start);
      const button = document.createElement(ref.book ? 'button' : 'span');
      button.textContent = ref.label;
      range.deleteContents(); range.insertNode(button);
      if (!ref.book) continue;
      (button as HTMLButtonElement).type = 'button';
      button.className = 'reader-bible-reference';
      button.setAttribute('aria-expanded', 'false');
      const panel = document.createElement('section');
      panel.className = 'reader-bible-passage'; panel.hidden = true;
      panel.id = `reader-bible-${generation}-${index}`;
      button.setAttribute('aria-controls', panel.id);
      const heading = document.createElement('h3');
      const edition = document.createElement('p'); edition.className = 'reader-bible-edition'; edition.textContent = 'Bible Fillion';
      const content = document.createElement('div');
      const status = document.createElement('p'); status.className = 'reader-bible-status'; status.setAttribute('role', 'status');
      const action = document.createElement('button'); action.type = 'button'; action.className = 'reader-button';
      panel.append(heading, edition, content, status, action);
      panels.prepend(panel);
      let started = false, sequence = 0, wholeChapter = false, jumpAfterLoad = false;
      const scrollToReference = () => {
        const cited = content.querySelector<HTMLElement>('.reader-bible-cited');
        const target = cited || panel, style = getComputedStyle(body);
        const top = body.scrollTop + target.getBoundingClientRect().top - body.getBoundingClientRect().top
          - parseFloat(style.paddingTop);
        // A citation near the chapter's end needs enough trailing room to reach
        // the top. A short chapter may grow the modal up to its CSS max-height.
        const padding = style.boxSizing === 'content-box' ? parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) : 0;
        const height = Math.max(body.clientHeight, (parseFloat(style.maxHeight) || 0) + padding);
        const missing = top - (body.scrollHeight - height);
        if (cited && missing > 0) panel.style.paddingBottom = `${parseFloat(getComputedStyle(panel).paddingBottom) + Math.ceil(missing)}px`;
        // Scroll only the modal, leaving the book and its bookmark untouched.
        body.scrollTop = top;
      };
      const show = async (whole: boolean) => {
        const current = ++sequence;
        wholeChapter = whole; jumpAfterLoad = false; panel.style.paddingBottom = '';
        heading.textContent = whole ? `${bookTitle(ref.book!)} ${ref.chapter}` : ref.label;
        status.textContent = whole ? 'Chapitre en cours de chargement…' : 'Verset en cours de chargement…';
        panel.setAttribute('aria-busy', 'true'); action.hidden = true;
        try {
          const verses = await this.passage(ref, whole);
          if (generation !== this.generation || current !== sequence) return;
          content.replaceChildren(...verses.map(verse => {
            const p = document.createElement('p');
            if (whole && inReference(verse, ref)) p.className = 'reader-bible-cited';
            const number = document.createElement('sup'); number.textContent = String(verse.verse);
            p.append(number, document.createTextNode(' ' + verse.text));
            return p;
          }));
          status.textContent = '';
          action.textContent = whole ? 'Revenir au passage cité' : 'Lire le chapitre entier';
          action.onclick = () => { content.replaceChildren(); body.scrollTop = 0; void show(!whole); };
        } catch {
          if (generation !== this.generation || current !== sequence) return;
          status.textContent = 'Ce passage n’est pas disponible. Vérifiez votre connexion ou la référence de l’édition.';
          action.textContent = 'Réessayer'; action.onclick = () => { void show(whole); };
        }
        if (generation === this.generation && current === sequence) {
          panel.setAttribute('aria-busy', 'false'); action.hidden = false;
          if (jumpAfterLoad) scrollToReference();
        }
      };
      const open = () => {
        panel.hidden = false; button.setAttribute('aria-expanded', 'true');
        if (!started) { started = true; void show(false); }
      };
      button.onclick = () => {
        open();
        jumpAfterLoad = wholeChapter;
        scrollToReference();
      };
      activate.unshift(open);
    }
    if (panels.childElementCount) body.append(panels);
    if (automatic) for (const open of activate) open();
  }
}
