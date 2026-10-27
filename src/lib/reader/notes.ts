import type { Book, Contents } from 'epubjs';
const EPUB = 'http://www.idpf.org/2007/ops';
const BASE = 'https://epub.invalid';
const notePath = (path: string) => path.includes('/literae-notes/');

/** Only constructed for Sainte Bible books. All documents stay inside the EPUB archive. */
export class BibleNotes {
  private cache = new Map<string, Promise<Document>>();
  private dialog: HTMLDialogElement;
  private body: HTMLElement;
  private title: HTMLElement;
  private origin: HTMLAnchorElement | null = null;
  private sequence = 0;
  constructor(private book: Book, private root: HTMLElement, private onToggle: (open: boolean) => void) {
    this.dialog = root.querySelector<HTMLDialogElement>('[data-reader="note-dialog"]')!;
    this.body = this.dialog.querySelector('[data-reader="note-body"]')!;
    this.title = this.dialog.querySelector('[data-reader="note-title"]')!;
    this.dialog.querySelector('button')!.onclick = () => this.dialog.close();
    this.dialog.onclick = event => { if (event.target === this.dialog) {
      const r = this.dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) this.dialog.close();
    } };
    this.dialog.onclose = () => { this.sequence++; this.onToggle(false); this.origin?.focus({ preventScroll: true }); };
  }
  private resolve(href: string, source: string) {
    const url = new URL(href, BASE + this.book.resolve(source));
    if (url.origin !== BASE) throw new Error('Lien extérieur à l’EPUB');
    return { path: decodeURIComponent(url.pathname), id: decodeURIComponent(url.hash.slice(1)) };
  }
  private document(path: string): Promise<Document> {
    let pending = this.cache.get(path);
    if (!pending) {
      pending = this.book.load(path).then(doc => doc as Document);
      this.cache.set(path, pending);
      pending.catch(() => this.cache.delete(path));
      // A few biblical books, never all the notes of the Bible.
      while (this.cache.size > 3) this.cache.delete(this.cache.keys().next().value!);
    }
    return pending;
  }
  prefetch(doc: Document, source: string) {
    const link = doc.querySelector('link[rel="literae-notes"]')?.getAttribute('href');
    if (!link) return;
    const { path } = this.resolve(link, source);
    void this.document(path).catch(() => {}); // Failure is retried and reported on click.
  }
  bind(contents: Contents, source: string) {
    this.prefetch(contents.document, source);
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
  private async open(path: string, id: string, label: string) {
    const sequence = ++this.sequence;
    this.title.textContent = `Note ${label.replace(/[\[\]]/g, '').trim()}`;
    this.body.textContent = 'Chargement de la note…';
    if (!this.dialog.open) { this.onToggle(true); this.dialog.showModal(); }
    try {
      const doc = await this.document(path);
      if (sequence !== this.sequence) return;
      const anchor = doc.getElementById(id);
      const target = anchor?.closest('aside') || anchor;
      if (!target) throw new Error('Note absente');
      this.body.replaceChildren();
      // Copy text and a small set of formatting elements, without executable EPUB HTML.
      const allowed = new Set(['p','span','em','strong','b','i','u','sup','sub','br','ul','ol','li','blockquote','table','thead','tbody','tr','th','td','caption','abbr','small','a','section','aside','div']);
      const copy = (node: Node, parent: Node) => {
        if (node.nodeType === 3) { parent.appendChild(document.createTextNode(node.textContent || '')); return; }
        if (node.nodeType !== 1) return;
        const el = node as Element, tag = el.localName.toLowerCase();
        if (['script','style','iframe','object','embed','form'].includes(tag) || el.classList.contains('mw-cite-backlink')) return;
        const out = allowed.has(tag) ? document.createElement(tag) : document.createElement('span');
        if (tag === 'a' && (el.getAttribute('role') === 'doc-backlink' || (el.getAttribute('href') || '').includes('#cite_ref'))) return;
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
      for (const child of target.childNodes) copy(child, this.body);
      this.body.scrollTop = 0;
    } catch {
      if (sequence === this.sequence) this.body.textContent = 'Cette note ne peut pas être chargée. Fermez puis réessayez.';
    }
  }
  destroy() { this.sequence++; if (this.dialog.open) this.dialog.close(); this.origin = null; this.cache.clear(); }
}
