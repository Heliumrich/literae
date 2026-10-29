import type { Book, Contents } from 'epubjs';
import { NotePreview } from './note-preview';
import { NoteBible } from './note-bible';
import { readerBibleProfile, bibleContextForSource } from './bible-profile';
import { inlineBibleLinks } from './inline-bible';
import type { NoteBibleReference, NoteBibleContext } from './bible-references';
const EPUB = 'http://www.idpf.org/2007/ops';
const BASE = 'https://epub.invalid';
const notePath = (path: string) => path.includes('/literae-notes/');

type CachedNote = { promise: Promise<Document>; ready: boolean };

/** Prepared notes for any book; only the active section and its neighbours preload. */
export class EpubNotes {
  private cache = new Map<string, CachedNote>();
  private links = new Map<string, string[]>();
  private context: string[] = [];
  private current = '';
  private pinned = new Set<string>();
  private dialog: HTMLDialogElement;
  private body: HTMLElement;
  private title: HTMLElement;
  private origin: HTMLAnchorElement | null = null;
  private sequence = 0;
  private bible: NoteBible;
  private profile: NoteBibleContext;
  private previewBible = new NoteBible();
  private preview: NotePreview;
  private inline = new WeakMap<Document, ReturnType<typeof inlineBibleLinks>>();
  constructor(private book: Book, private root: HTMLElement, private onToggle: (open: boolean) => void, private displayText: (text: string) => string = text => text) {
    this.preview = new NotePreview(root, () => this.previewBible.reset());
    this.profile = readerBibleProfile(root.dataset.bookId || '');
    this.bible = new NoteBible(this.profile);
    this.dialog = root.querySelector<HTMLDialogElement>('[data-reader="note-dialog"]')!;
    this.body = this.dialog.querySelector('[data-reader="note-body"]')!;
    this.title = this.dialog.querySelector('[data-reader="note-title"]')!;
    this.dialog.querySelector('button')!.onclick = () => this.dialog.close();
    this.dialog.onclick = event => { if (event.target === this.dialog) {
      const r = this.dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) this.dialog.close();
    } };
    this.dialog.onclose = () => { this.sequence++; this.bible.reset(); this.onToggle(false); this.origin?.focus({ preventScroll: true }); };
  }
  private resolve(href: string, source: string) {
    const url = new URL(href, BASE + this.book.resolve(source));
    if (url.origin !== BASE) throw new Error('Lien extérieur à l’EPUB');
    return { path: decodeURIComponent(url.pathname), id: decodeURIComponent(url.hash.slice(1)) };
  }
  private emit(name: string, detail: Record<string, unknown>) {
    this.root.dispatchEvent(new CustomEvent(`reader:${name}`, { detail, bubbles: true }));
  }
  private canonical(source: string) { return this.resolve('', source).path; }
  private document(path: string, source = '', reason = 'click'): Promise<Document> {
    let entry = this.cache.get(path);
    if (!entry) {
      const start = performance.now();
      entry = { promise: this.book.load(path).then(doc => doc as Document), ready: false };
      this.cache.set(path, entry);
      this.emit('notes-load', { path, source, reason, state: 'start', context: [...this.context] });
      const current = entry;
      entry.promise.then(() => {
        current.ready = true;
        if (this.cache.get(path) !== current) return;
        this.emit('notes-load', { path, source, reason, state: 'ready', elapsedMs: performance.now() - start });
        this.reportContext();
      }).catch(() => {
        if (this.cache.get(path) === current) this.cache.delete(path);
        this.emit('notes-load', { path, source, reason, state: 'error' });
      });
    } else {
      this.cache.delete(path);
      this.cache.set(path, entry);
    }
    // Keep the requested neighbourhood warm, plus a few recent note documents.
    const limit = Math.max(6, this.pinned.size);
    for (const key of this.cache.keys()) {
      if (this.cache.size <= limit) break;
      if (key !== path && !this.pinned.has(key)) this.cache.delete(key);
    }
    return entry.promise;
  }
  private reportContext() {
    this.emit('notes-context', {
      current: this.current, sources: this.context, paths: [...this.pinned],
      ready: [...this.pinned].filter(path => this.cache.get(path)?.ready), cached: [...this.cache.keys()],
    });
  }
  private refresh() {
    this.pinned = new Set(this.context.flatMap(source => this.links.get(source) || []));
    for (const source of this.context) {
      for (const path of this.links.get(source) || []) {
        void this.document(path, source, source === this.current ? 'current' : 'adjacent').catch(() => {});
      }
    }
    this.reportContext();
  }
  /** Recording a far-away rendered section never preloads its notes. */
  register(doc: Document, source: string) {
    const key = this.canonical(source);
    const paths = [...doc.querySelectorAll('link[rel~="literae-notes"]')].flatMap(link => {
      try { return [this.resolve(link.getAttribute('href') || '', source).path]; } catch { return []; }
    });
    this.links.set(key, [...new Set(paths)]);
    if (this.context.includes(key)) this.refresh();
  }
  setContext(current: string, nearby: string[]) {
    const sources = nearby.map(source => this.canonical(source));
    const key = this.canonical(current);
    if (key === this.current && sources.join('|') === this.context.join('|')) return;
    this.current = key;
    this.context = sources;
    this.refresh();
  }
  bind(contents: Contents, source: string) {
    contents.document.documentElement.dataset.readerSource = this.canonical(source);
    this.register(contents.document, source);
    const links = inlineBibleLinks(contents.document, bibleContextForSource(this.profile, source), (ref, origin) => {
      this.origin = origin;
      this.openReference(ref);
    }, (event, ref, origin) => {
      if (this.dialog.open) return;
      this.preview.enter(event, origin, body => {
        this.previewBible.setContext(bibleContextForSource(this.profile, source));
        body.textContent = ref.label;
        this.previewBible.enhance(body, ref, true);
      });
    }, () => this.preview.leave());
    this.inline.set(contents.document, links);
    contents.on('resize', links.refresh);
    const hover = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const anchor = (event.target as Element)?.closest?.('a[href*="literae-notes/"]') as HTMLAnchorElement | null;
      if (!anchor || this.dialog.open) return;
      let target;
      try { target = this.resolve(anchor.getAttribute('href')!, source); } catch { return; }
      if (!target.id) return;
      this.preview.enter(event, anchor, async (body, current) => {
        try {
          const doc = await this.document(target.path, source, 'hover');
          if (!current()) return;
          this.copyNote(doc, target.id, target.path, body);
          this.previewBible.setContext(bibleContextForSource(this.profile, target.path));
          this.previewBible.enhance(body, undefined, true);
        } catch { if (current()) body.textContent = 'Ouvrez la note pour réessayer.'; }
      });
    };
    contents.document.addEventListener('pointerover', hover);
    contents.document.addEventListener('pointermove', hover);
    contents.document.addEventListener('pointerout', event => {
      if ((event.target as Element)?.closest?.('a[href*="literae-notes/"]')) this.preview.leave();
    });
    contents.document.addEventListener('pointerdown', () => this.preview.close());
    contents.document.addEventListener('keydown', event => { if (event.key === 'Escape') this.preview.close(); });
    contents.document.addEventListener('scroll', () => this.preview.close(), true);
    contents.document.addEventListener('click', event => {
      const anchor = (event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href')!;
      const semantic = anchor.getAttributeNS(EPUB, 'type')?.split(/\s+/).includes('noteref')
        || anchor.getAttribute('role') === 'doc-noteref';
      if (!semantic && !href.includes('literae-notes/')) return;
      let target;
      try { target = this.resolve(href, source); } catch { return; }
      if (!target.id) return;
      // Capture before EPUB.js' anchor onclick handler can navigate the rendition.
      event.preventDefault(); event.stopImmediatePropagation();
      this.origin = anchor;
      void this.open(target.path, target.id, anchor.textContent || '');
    }, true);
  }
  refreshInline(doc: Document) { this.inline.get(doc)?.refresh(); }
  private openReference(ref: NoteBibleReference) {
    this.preview.close();
    this.sequence++; this.bible.reset();
    this.title.textContent = ref.label;
    this.body.textContent = ref.label;
    if (!this.dialog.open) { this.onToggle(true); this.dialog.showModal(); }
    this.bible.enhance(this.body, ref);
    this.body.scrollTop = 0;
    this.emit('reference-opened', { reference: ref.label });
  }
  private async open(path: string, id: string, label: string) {
    this.preview.close();
    const sequence = ++this.sequence;
    this.bible.reset();
    this.bible.setContext(bibleContextForSource(this.profile, path));
    const start = performance.now();
    const cached = this.cache.get(path)?.ready === true;
    this.title.textContent = `Note ${label.replace(/[\[\]]/g, '').trim()}`;
    this.body.textContent = 'Chargement de la note…';
    if (!this.dialog.open) { this.onToggle(true); this.dialog.showModal(); }
    try {
      const doc = await this.document(path);
      if (sequence !== this.sequence) return;
      this.copyNote(doc, id, path, this.body);
      this.bible.enhance(this.body);
      this.body.scrollTop = 0;
      this.emit('note-opened', { path, id, cached, elapsedMs: performance.now() - start });
    } catch {
      if (sequence === this.sequence) this.body.textContent = 'Cette note ne peut pas être chargée. Fermez puis réessayez.';
    }
  }
  private copyNote(doc: Document, id: string, path: string, body: HTMLElement) {
    const anchor = doc.getElementById(id);
    const target = anchor?.closest('aside') || anchor;
    if (!target) throw new Error('Note absente');
    body.replaceChildren();
    // Copy text and a small set of formatting elements, without executable EPUB HTML.
    const allowed = new Set(['p','span','em','strong','b','i','u','sup','sub','br','ul','ol','li','blockquote','table','thead','tbody','tr','th','td','caption','abbr','small','a','section','aside','div']);
    const copy = (node: Node, parent: Node) => {
      if (node.nodeType === 3) { parent.appendChild(document.createTextNode(this.displayText(node.textContent || ''))); return; }
      if (node.nodeType !== 1) return;
      const el = node as Element, tag = el.localName.toLowerCase();
      if (['script','style','iframe','object','embed','form'].includes(tag) || el.classList.contains('mw-cite-backlink')) return;
      const out = allowed.has(tag) ? document.createElement(tag) : document.createElement('span');
      if (tag === 'a' && (el.getAttribute('role') === 'doc-backlink' || el.classList.contains('footnote-back') || el.classList.contains('backref') || (el.getAttribute('href') || '').includes('#cite_ref'))) return;
      if (tag === 'a') {
        const href = el.getAttribute('href') || '';
        try {
          const target = this.resolve(href, path);
          if (notePath(target.path) && target.id) {
            out.setAttribute('href', '#');
            out.addEventListener('click', event => { event.preventDefault(); void this.open(target.path, target.id, el.textContent || ''); });
          }
        } catch {
          if (/^https?:\/\//i.test(href)) { out.setAttribute('href', href); out.setAttribute('target','_blank'); out.setAttribute('rel','noopener noreferrer'); }
        }
      }
      parent.appendChild(out);
      for (const child of el.childNodes) copy(child, out);
    };
    for (const child of target.childNodes) copy(child, body);
    for (const paragraph of body.querySelectorAll('p')) if (!paragraph.textContent?.trim() && !paragraph.children.length) paragraph.remove();
  }
  destroy() { this.preview.destroy(); this.previewBible.destroy(); this.sequence++; if (this.dialog.open) this.dialog.close(); this.bible.destroy(); this.origin = null; this.cache.clear(); this.links.clear(); this.context = []; this.pinned.clear(); }
}
