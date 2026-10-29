import { bookTitle } from '../bible-ref';
import { findNoteBibleReferences, isBibleReferenceOnly, type NoteBibleReference, type NoteBibleContext } from './bible-references';

import { bibleTargets, type BibleTarget } from './bible-concordance';
import { catholicBibleBookTitle, biblePassageLocation } from './bible-heading';
import { referenceText, referenceRange, removeNotePrefix } from './reference-dom';

type Verse = { chapter: number; verse: number; text: string };
type Passage = { code: string; name: string; verses: Verse[] };
const inTarget = (verse: Verse, target: BibleTarget) => verse.chapter === target.chapter &&
  (!target.ranges.length || target.ranges.some(range => verse.verse >= range.first && verse.verse <= range.last));

/** On-demand comparator passages, independent of EPUB note preloading and CFI. */
export class NoteBible {
  private controller = new AbortController();
  private cache = new Map<string, Passage>();
  private pending = new Map<string, Promise<Passage>>();
  private generation = 0;
  constructor(private context: NoteBibleContext = {}) {}
  setContext(context: NoteBibleContext) { this.context = context; }

  reset() {
    this.generation++;
    this.controller.abort();
    this.controller = new AbortController();
    this.pending.clear();
  }
  destroy() { this.reset(); this.cache.clear(); }

  private url(ref: BibleTarget, code: string, range?: { first: number; last: number }) {
    // Stable translation code, never an ID that can change between DB releases.
    const params = new URLSearchParams({ book: ref.book!, chapter: String(ref.chapter), translation: code });
    if (range) {
      params.set('verse', String(range.first));
      if (range.last !== range.first) params.set('verseEnd', String(range.last));
    }
    return `/api/bible/verses?${params}`;
  }

  private async fetchVerses(url: string): Promise<Passage> {
    const cached = this.cache.get(url);
    if (cached) return cached;
    const pending = this.pending.get(url);
    if (pending) return pending;
    const generation = this.generation;
    const task = (async () => {
      const response = await fetch(url, { signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) throw new Error('Passage indisponible');
      const data = await response.json();
      const code = new URL(url, location.origin).searchParams.get('translation');
      const result = data.results?.find((result: { code: string }) => result.code === code);
      if (!Array.isArray(result?.verses) || !result.verses.length || !result.verses.every((verse: Verse) =>
        Number.isInteger(verse.verse) && typeof verse.text === 'string')) throw new Error('Passage absent de la traduction');
      const passage: Passage = { code: result.code, name: result.name, verses: result.verses.map((v: Verse) => ({ ...v, chapter: data.chapter })) };
      if (generation === this.generation) {
        this.cache.set(url, passage);
        if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value!);
      }
      return passage;
    })();
    this.pending.set(url, task);
    try { return await task; }
    finally { if (this.pending.get(url) === task) this.pending.delete(url); }
  }

  private async passage(ref: NoteBibleReference, whole: boolean): Promise<Passage> {
    const targets = bibleTargets(ref);
    const preferred = this.context.translation || 'FIL';
    const generation = this.generation, signal = this.controller.signal;
    for (const code of [...new Set([preferred, 'FIL'])]) {
      try {
        const parts = await Promise.all(targets.map(async target => {
          const chapterUrl = this.url(target, code);
          const chapter = this.cache.get(chapterUrl);
          const parts = whole || !target.ranges.length ? [await this.fetchVerses(chapterUrl)]
            : chapter ? [chapter] : await Promise.all(target.ranges.map(range => this.fetchVerses(this.url(target, code, range))));
          const verses = [...new Map(parts.flatMap(p => p.verses).filter(v => whole || inTarget(v, target)).map(v => [v.verse, v])).values()]
            .sort((a, b) => a.verse - b.verse);
          for (const range of target.ranges) for (let v = range.first; v <= range.last; v++)
            if (!verses.some(row => row.verse === v)) throw new Error('Verset absent');
          return { code, name: parts[0].name, verses };
        }));
        return { code, name: parts[0].name, verses: parts.flatMap(p => p.verses) };
      } catch (error) {
        if (code === 'FIL' || signal.aborted || generation !== this.generation) throw error;
      }
    }
    throw new Error('Passage indisponible');
  }

  enhance(body: HTMLElement, single?: NoteBibleReference) {
    if (!single) {
      const map = referenceText(body);
      if (this.context.noteHeadings === 'glaire') {
        const first = findNoteBibleReferences(map.text, this.context)[0];
        const colon = first && map.text.slice(first.end).match(/^\s*:\s*/);
        if (first && !map.text.slice(0, first.start).trim() && colon)
          removeNotePrefix(body, first.end + colon[0].length);
      } else if (this.context.noteHeadings === 'crampon') {
        const prefix = map.text.match(/^\s*(?:[IVXLCDM]+[.,]\s*)?\d+(?:[-–]\d+)?\.\s+/);
        if (prefix) removeNotePrefix(body, prefix[0].length);
      }
    }
    const map = referenceText(body), { text, nodes } = map;
    const refs = single ? [{ ...single, start: nodes[0].start, end: nodes[0].start + single.label.length }] : findNoteBibleReferences(text, this.context);
    const generation = this.generation;
    // Only replace the source when every citation can actually be displayed.
    const automatic = isBibleReferenceOnly(text, refs) && refs.every(ref =>
      referenceRange(map, ref.start, ref.end) && !nodes.some(n => n.start < ref.end && n.end > ref.start && n.node.parentElement?.closest('a[href]')));
    const panels = document.createElement('div');
    panels.className = 'reader-bible-passages';
    const activate: (() => void)[] = [];
    // Reverse replacement keeps offsets valid, including several refs in one node.
    for (const [index, ref] of [...refs.entries()].reverse()) {
      const range = referenceRange(map, ref.start, ref.end);
      if (!range) continue;
      // Never nest an interactive reference inside an existing EPUB hyperlink.
      if (nodes.some(n => n.start < ref.end && n.end > ref.start && n.node.parentElement?.closest('a[href]'))) continue;
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
      heading.textContent = catholicBibleBookTitle(ref.book);
      const coordinates = document.createElement('p'); coordinates.className = 'reader-bible-location';
      const edition = document.createElement('p'); edition.className = 'reader-bible-edition'; edition.textContent = '';
      const targets = bibleTargets(ref);
      const content = document.createElement('div');
      const status = document.createElement('p'); status.className = 'reader-bible-status'; status.setAttribute('role', 'status');
      const action = document.createElement('button'); action.type = 'button'; action.className = 'reader-button';
      const jump = document.createElement('button'); jump.type = 'button'; jump.className = 'reader-bible-jump';
      jump.textContent = 'Aller au passage cité'; jump.hidden = true;
      panel.append(heading, coordinates, edition, jump, content, status, action);
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
        coordinates.textContent = biblePassageLocation(targets, whole);
        status.textContent = whole ? 'Chapitre en cours de chargement…' : 'Verset en cours de chargement…';
        panel.setAttribute('aria-busy', 'true'); action.hidden = true; jump.hidden = true;
        try {
          const passage = await this.passage(ref, whole);
          const verses = passage.verses;
          if (generation !== this.generation || current !== sequence) return;
          edition.textContent = passage.name + (passage.code === 'FIL' && this.context.translation && this.context.translation !== 'FIL' ? ' (traduction de secours)' : '');
          if (ref.numbering === 'hebrew') edition.textContent += ` · Correspondance : ${bookTitle(ref.book!)} ${targets.map(t => `${t.chapter}${t.ranges.length ? ':' + t.ranges.map(r => r.first === r.last ? r.first : `${r.first}–${r.last}`).join(', ') : ''}`).join(' ; ')}`;
          content.replaceChildren(...verses.map(verse => {
            const p = document.createElement('p');
            if (whole && targets.some(target => inTarget(verse, target))) p.className = 'reader-bible-cited';
            const number = document.createElement('sup'); number.textContent = targets.length > 1 ? `${verse.chapter}:${verse.verse}` : String(verse.verse);
            p.append(number, document.createTextNode(' ' + verse.text));
            return p;
          }));
          status.textContent = '';
          jump.hidden = !automatic || !whole || !ref.ranges.length;
          action.textContent = whole ? 'Revenir au passage cité' : targets.length > 1 ? 'Lire les chapitres entiers' : 'Lire le chapitre entier';
          action.onclick = () => { content.replaceChildren(); body.scrollTop = 0; void show(!whole); };
        } catch {
          if (generation !== this.generation || current !== sequence) return;
          status.textContent = 'Ce passage n’est pas disponible. Vérifiez votre connexion ou la référence de l’édition.';
          action.textContent = 'Réessayer'; action.onclick = () => { void show(whole); };
        }
        if (generation === this.generation && current === sequence) {
          panel.setAttribute('aria-busy', 'false'); action.hidden = !ref.ranges.length && !status.textContent;
          if (jumpAfterLoad) scrollToReference();
        }
      };
      jump.onclick = scrollToReference;
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
    if (panels.childElementCount) {
      if (automatic) {
        panels.classList.add('reader-bible-passages-only');
        body.replaceChildren(panels);
      } else body.append(panels);
    }
    if (automatic) for (const open of activate) open();
  }
}
