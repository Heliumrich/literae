import type { Book, Contents, Location, Rendition } from 'epubjs';
import { EpubNotes } from './notes';
import { ReaderToc } from './toc';
import type Section from 'epubjs/types/section';
import type { BookEdition } from '../books';
import { PALETTES, SETTINGS_KEY, parseSettings, readerCss } from './preferences';
import { lastEditionKey, legacyProgressForFile, parseProgress, progressKey, type ReadingProgress } from './progress';

type SectionView = { index: number; element: HTMLElement; displayed: boolean; contents?: Contents };
// EPUB.js exposes these at runtime but omits them from its declaration files.
type ContinuousRendition = Rendition & { manager: { container: HTMLElement; views: { all(): SectionView[] }; q: Rendition['q'] } };

function readLocal(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function writeLocal(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

async function initReader(root: HTMLElement) {
  const el = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-reader="${name}"]`)!;
  const viewport = el<HTMLDivElement>('viewport');
  const selectEdition = el<HTMLSelectElement>('edition');
  const toc = new ReaderToc(root, href => { void navigate(() => rendition!.display(href)); });
  const previous = el<HTMLButtonElement>('previous');
  const next = el<HTMLButtonElement>('next');
  const message = el<HTMLDivElement>('message');
  const error = el<HTMLParagraphElement>('error');
  const progressLabel = el<HTMLParagraphElement>('progress');
  const editions: BookEdition[] = JSON.parse(root.dataset.editions || '[]');
  const editionKey = lastEditionKey(root.dataset.bookId!);
  let settings = parseSettings(readLocal(SETTINGS_KEY));
  let bookmark: ReadingProgress | null = null;
  let book: Book | undefined;
  let notes: EpubNotes | undefined;
  let rendition: ContinuousRendition | undefined;
  let sections: Section[] = [];
  let selected = editions.find(edition => edition.id === readLocal(editionKey)) || editions[0];
  let epoch = 0;
  let controller: AbortController | undefined;
  let openingTask: Promise<void> = Promise.resolve();
  let canSave = false;
  let settingsTimer = 0;
  let settingsEpoch = 0;
  let storageAvailable = true;
  const prefetched = new Set<number>();

  const dark = () => document.documentElement.dataset.theme === 'dark';
  function styleDocument(contents: Contents) {
    const doc = contents.document;
    let style = doc.getElementById('literae-reader-style');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'literae-reader-style';
      doc.head.appendChild(style);
    }
    const cover = /(?:^|\/)titlepage\.xhtml(?:[?#]|$)/i.test(doc.URL)
      || !!doc.querySelector('meta[name="calibre:cover"][content="true"], .literae-cover')
      || sections.some(section => section.index === contents.sectionIndex && /(?:^|\/)titlepage\.xhtml$/i.test(section.href));
    // Graphic pages retain their own typography and colours. Their viewport must
    // have a real height before EPUB.js measures absolutely positioned content.
    style.textContent = cover ? `
      html, body { height: ${viewport.clientHeight}px !important; min-height: ${viewport.clientHeight}px !important;
        margin: 0 !important; padding: 0 !important; max-width: none !important; }
      html body svg { max-height: none !important; max-width: 100% !important; }
      .literae-cover { height: 100%; position: relative; }
    ` : readerCss(settings, dark(), location.origin);
    doc.documentElement.lang ||= 'fr';
  }
  function updatePalette() {
    const palette = PALETTES[settings.palette === 'auto' ? dark() ? 'night' : 'cream' : settings.palette];
    root.style.setProperty('--reader-bg', palette.bg);
    root.style.setProperty('--reader-fg', palette.fg);
  }
  function showSettings() {
    for (const name of ['font', 'size', 'margin', 'palette'] as const) el<HTMLInputElement | HTMLSelectElement>(name).value = String(settings[name]);
    el<HTMLInputElement>('justify').checked = settings.justify;
    el<HTMLInputElement>('hyphenate').checked = settings.hyphenate;
    el<HTMLOutputElement>('size-label').value = `${settings.size} px`;
    el<HTMLOutputElement>('margin-label').value = `${settings.margin} px`;
    updatePalette();
  }
  function fail() {
    error.hidden = false;
    error.querySelector('span')!.textContent = 'Le livre n’a pas pu être chargé. Vérifiez votre connexion puis réessayez.';
    message.textContent = '';
    viewport.setAttribute('aria-busy', 'false');
  }
  /** Keep the neighbouring XHTML parsed; EPUB.js manages nearby rendered frames. */
  function preloadNeighbours(index: number) {
    const currentBook = book;
    if (!currentBook) return;
    const position = sections.findIndex(section => section.index === index);
    const neighbours = sections.slice(Math.max(0, position - 1), position + 2);
    const nearby = new Set(neighbours.map(section => section.index));
    if (position >= 0) notes?.setContext(sections[position].href, neighbours.map(section => section.href));
    for (const section of sections.filter(section => nearby.has(section.index))) {
      if (prefetched.has(section.index)) continue;
      prefetched.add(section.index);
      Promise.resolve(section.load(currentBook.load.bind(currentBook))).catch(() => prefetched.delete(section.index));
    }
    const rendered = new Set(rendition?.manager.views.all().filter(view => view.displayed).map(view => view.index));
    for (const old of prefetched) {
      if (!nearby.has(old) && !rendered.has(old)) {
        sections.find(section => section.index === old)?.unload();
        prefetched.delete(old);
      }
    }
  }
  function saveLocation(location: Location) {
    if (!canSave || !location.start?.cfi || !rendition) return;
    const index = location.start.index;
    const view = rendition.manager.views.all().find(view => view.index === index && view.displayed);
    const bounds = view?.element.getBoundingClientRect();
    const top = rendition.manager.container.getBoundingClientRect().top;
    const fraction = bounds?.height ? Math.max(0, Math.min(.999, (top - bounds.top) / bounds.height)) : 0;
    bookmark = { cfi: location.start.cfi, updated: Date.now() };
    storageAvailable = writeLocal(progressKey(selected.id), bookmark);
    const percent = Math.min(100, Math.round((index + fraction) / Math.max(1, sections.length) * 100));
    progressLabel.textContent = `${percent} %${storageAvailable ? '' : ' · Sauvegarde indisponible'}`;
    previous.disabled = location.atStart;
    next.disabled = location.atEnd;
    toc.setCurrent(location.start.href);
    preloadNeighbours(index);
  }

  async function restorePosition(progress: ReadingProgress | null, active: ContinuousRendition) {
    if (!progress) { await active.display(); return; }
    try { await active.display(progress.cfi); }
    catch { await active.display(); } // A replaced EPUB may invalidate its old CFI.
  }

  function requestEdition(id: string) {
    const requested = editions.find(edition => edition.id === id);
    if (requested) el<HTMLAnchorElement>('download').href = requested.downloadUrl;
    const currentEpoch = ++epoch;
    canSave = false;
    controller?.abort();
    window.clearTimeout(settingsTimer);
    settingsEpoch++;
    // EPUB.js starts its rendition asynchronously. Finish that work before destroying
    // it, so rapid switches cannot start a rendition whose book was already released.
    openingTask = openingTask.then(async () => {
      if (currentEpoch === epoch) await openEdition(id, currentEpoch);
    });
    return openingTask;
  }

  async function openEdition(id: string, currentEpoch: number) {
    const requested = editions.find(edition => edition.id === id);
    if (!requested) return;
    controller = new AbortController();
    // A switch releases the old rendition and cancels any in-flight download.
    rendition?.q.stop();
    rendition?.manager?.q.stop();
    notes?.destroy();
    notes = undefined;
    book?.destroy();
    book = undefined;
    rendition = undefined;
    viewport.replaceChildren();
    prefetched.clear();
    selected = requested;
    bookmark = parseProgress(readLocal(progressKey(selected.id)))
      || legacyProgressForFile(readLocal(`literae-book-progress-v1:${root.dataset.bookId}`), selected.id);
    selectEdition.value = id;
    toc.loading();
    previous.disabled = next.disabled = true;
    el<HTMLAnchorElement>('download').href = selected.downloadUrl;
    error.hidden = true;
    message.textContent = 'Ouverture du livre…';
    viewport.setAttribute('aria-busy', 'true');
    let openingBook: Book | undefined;
    try {
      const [{ default: ePub }, response] = await Promise.all([
        import('epubjs'), fetch(selected.url, { signal: controller.signal, mode: 'cors', credentials: 'omit' }),
      ]);
      if (!response.ok) throw new Error(`EPUB HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      if (currentEpoch !== epoch) return;
      openingBook = ePub();
      await openingBook.open(buffer);
      await openingBook.ready;
      if (currentEpoch !== epoch) { openingBook.destroy(); return; }
      book = openingBook;
      notes = new EpubNotes(book, root, open => {
        if (currentEpoch !== epoch) return;
        canSave = !open;
        if (!open && rendition) {
          rendition.resize(viewport.clientWidth, viewport.clientHeight);
        }
      });
      const currentNotes = notes;
      book.spine.hooks.content.register((doc: Document, section: Section) => { currentNotes.register(doc, section.href); });
      sections = [];
      book.spine.each((section: Section) => { if (section.linear) sections.push(section); });
      if (!sections.length) throw new Error('EPUB sans texte');
      const navigation = (await book.loaded.navigation).toc;
      toc.setItems(navigation.length ? navigation : sections.map((section, index) => ({
        id: `section-${index}`, href: section.href, label: `Section ${index + 1}`, subitems: [], parent: undefined,
      })), selected.id);
      const active = book.renderTo(viewport, {
        manager: 'continuous', flow: 'scrolled', spread: 'none', width: viewport.clientWidth, height: viewport.clientHeight,
        resizeOnOrientationChange: false,
        allowScriptedContent: false,
      }) as ContinuousRendition;
      rendition = active;
      active.hooks.content.register((contents: Contents) => {
        if (currentEpoch !== epoch) return;
        styleDocument(contents);
        const source = sections.find(section => section.index === contents.sectionIndex)?.href;
        if (source) notes?.bind(contents, source);
        contents.on('keydown', onKeydown);
      });
      active.on('rendered', (_section: Section, view: { iframe?: HTMLIFrameElement }) => {
        if (currentEpoch === epoch && view.iframe) {
          view.iframe.title = `Texte de ${root.closest('article')?.querySelector('h1')?.textContent || 'l’ouvrage'}`;
        }
      });
      active.on('relocated', (location: Location) => { if (currentEpoch === epoch) saveLocation(location); });
      await restorePosition(bookmark, active);
      if (currentEpoch !== epoch) return;
      canSave = true;
      writeLocal(editionKey, selected.id);
      viewport.setAttribute('aria-busy', 'false');
      message.textContent = '';
      await active.reportLocation();
    } catch (cause) {
      if (currentEpoch !== epoch) { openingBook?.destroy(); return; }
      console.error('Ouverture EPUB impossible', cause);
      fail();
    }
  }

  async function navigate(action: () => Promise<unknown>) {
    if (!rendition || !canSave) return;
    error.hidden = true;
    message.textContent = '';
    try { await action(); } catch { fail(); }
  }
  function onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (event.altKey || event.ctrlKey || event.metaKey || target?.closest('input,select,textarea,button,[contenteditable]')) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      void navigate(() => event.key === 'ArrowRight' ? rendition!.next() : rendition!.prev());
    }
  }

  /** Preserve the visible passage when typography or the automatic theme changes. */
  function applySettings() {
    showSettings();
    writeLocal(SETTINGS_KEY, settings);
    window.clearTimeout(settingsTimer);
    const currentEpoch = ++settingsEpoch;
    const saved = bookmark;
    settingsTimer = window.setTimeout(async () => {
      const active = rendition;
      if (!active || viewport.getAttribute('aria-busy') === 'true') return;
      canSave = false;
      try {
        const views = active.manager.views.all().filter(view => view.contents);
        for (const view of views) styleDocument(view.contents!);
        await nextFrame();
        await Promise.all(views.map(view => view.contents!.document.fonts.ready));
        if (currentEpoch !== settingsEpoch || active !== rendition) return;
        active.resize(viewport.clientWidth, viewport.clientHeight);
        if (saved) await active.display(saved.cfi);
      } catch { /* A section may disappear as the continuous reader trims its frames. */ }
      finally {
        if (currentEpoch === settingsEpoch && active === rendition) {
          canSave = true;
          void active.reportLocation();
        }
      }
    }, 160);
  }

  for (const name of ['font', 'size', 'margin', 'palette', 'justify', 'hyphenate'] as const) {
    el<HTMLInputElement | HTMLSelectElement>(name).addEventListener('input', () => {
      settings = parseSettings({ ...settings, [name]: name === 'justify' || name === 'hyphenate' ? el<HTMLInputElement>(name).checked
        : name === 'size' || name === 'margin' ? Number(el<HTMLInputElement>(name).value) : el<HTMLSelectElement>(name).value });
      applySettings();
    });
  }
  selectEdition.addEventListener('change', () => { void requestEdition(selectEdition.value); });
  previous.addEventListener('click', () => { void navigate(() => rendition!.prev()); });
  next.addEventListener('click', () => { void navigate(() => rendition!.next()); });
  viewport.addEventListener('keydown', onKeydown);
  el('retry').addEventListener('click', () => { void requestEdition(selected.id); });
  const themeObserver = new MutationObserver(() => { if (settings.palette === 'auto') applySettings(); });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const fullscreen = el<HTMLButtonElement>('fullscreen');
  fullscreen.hidden = !document.fullscreenEnabled;
  fullscreen.addEventListener('click', async () => {
    try { if (document.fullscreenElement === root) await document.exitFullscreen(); else await root.requestFullscreen(); } catch { /* Unavailable in some embedded browsers. */ }
  });
  document.addEventListener('fullscreenchange', () => {
    const label = document.fullscreenElement === root ? 'Quitter le plein écran' : 'Plein écran';
    fullscreen.setAttribute('aria-label', label);
    fullscreen.title = label;
  });
  let measuredWidth = viewport.clientWidth;
  let measuredHeight = viewport.clientHeight;
  const resizeObserver = new ResizeObserver(() => {
    const width = viewport.clientWidth, height = viewport.clientHeight;
    if (width === measuredWidth && height === measuredHeight) return;
    measuredWidth = width;
    measuredHeight = height;
    if (rendition && canSave) {
      for (const view of rendition.manager.views.all()) if (view.contents) styleDocument(view.contents);
      rendition.resize(width, height);
    }
  });
  resizeObserver.observe(viewport);
  document.addEventListener('visibilitychange', () => { if (document.hidden && bookmark && canSave) writeLocal(progressKey(selected.id), bookmark); });
  window.addEventListener('pagehide', () => { if (bookmark) writeLocal(progressKey(selected.id), bookmark); });
  showSettings();
  await requestEdition(selected.id);
}

export function initEpubReaders() {
  document.querySelectorAll<HTMLElement>('.epub-reader').forEach(root => { void initReader(root); });
}
