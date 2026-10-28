import type { NavItem } from 'epubjs';

type Entry = { href: string; label: string; button: HTMLButtonElement };

/** A nested chapter list. Expanded branches live only for this page instance. */
export class ReaderToc {
  private disclosure: HTMLDetailsElement;
  private summary: HTMLElement;
  private label: HTMLElement;
  private list: HTMLUListElement;
  private entries: Entry[] = [];
  private branches = new Map<string, Set<string>>();
  private ready = false;

  constructor(private root: HTMLElement, private navigate: (href: string) => void) {
    this.disclosure = root.querySelector('[data-reader="toc"]')!;
    this.summary = root.querySelector('[data-reader="toc-toggle"]')!;
    this.label = root.querySelector('[data-reader="toc-current"]')!;
    this.list = root.querySelector('[data-reader="toc-list"]')!;
    this.summary.addEventListener('click', event => { if (!this.ready) event.preventDefault(); });
    // Keep the two reader panels mutually exclusive, like the catalog filters.
    const settings = root.querySelector<HTMLDetailsElement>('.reader-settings')!;
    this.disclosure.addEventListener('toggle', () => { if (this.disclosure.open) settings.open = false; });
    settings.addEventListener('toggle', () => { if (settings.open) this.disclosure.open = false; });
    document.addEventListener('click', event => {
      if (event.target instanceof Node && !this.disclosure.contains(event.target)) this.disclosure.open = false;
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.disclosure.open) {
        this.disclosure.open = false;
        this.summary.focus({ preventScroll: true });
        event.preventDefault();
      }
    });
  }

  loading() {
    this.ready = false;
    this.disclosure.open = false;
    this.summary.setAttribute('aria-disabled', 'true');
    this.label.textContent = 'Chargement du sommaire…';
    delete this.disclosure.dataset.currentHref;
    this.entries = [];
    this.list.replaceChildren();
  }

  setItems(items: NavItem[], edition: string) {
    const expanded = this.branches.get(edition) || new Set<string>();
    this.branches.set(edition, expanded);
    this.entries = [];
    const build = (items: NavItem[], list: HTMLUListElement, parent: string) => {
      items.forEach((item, index) => {
        const key = `${parent}-${index}`;
        const li = document.createElement('li');
        const row = document.createElement('div');
        row.className = 'reader-toc-row';
        const chapter = document.createElement('button');
        chapter.type = 'button';
        chapter.className = 'reader-toc-link';
        chapter.dataset.reader = 'toc-link';
        chapter.dataset.href = item.href;
        chapter.textContent = item.label.trim() || 'Sans titre';
        chapter.addEventListener('click', () => {
          this.disclosure.open = false;
          this.summary.focus({ preventScroll: true });
          this.navigate(item.href);
        });
        this.entries.push({ href: item.href, label: chapter.textContent, button: chapter });
        row.append(chapter);
        li.append(row);
        if (item.subitems?.length) {
          const children = document.createElement('ul');
          children.id = `reader-toc-${this.root.dataset.bookId}${key}`;
          children.hidden = !expanded.has(key);
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'reader-toc-expand';
          toggle.dataset.reader = 'toc-expand';
          toggle.setAttribute('aria-controls', children.id);
          const arrow = document.createElement('span');
          arrow.setAttribute('aria-hidden', 'true');
          arrow.textContent = '›';
          toggle.append(arrow);
          const update = () => {
            toggle.setAttribute('aria-expanded', String(!children.hidden));
            toggle.setAttribute('aria-label', `${children.hidden ? 'Afficher' : 'Masquer'} les sous-parties de ${chapter.textContent}`);
          };
          toggle.addEventListener('click', () => {
            children.hidden = !children.hidden;
            if (children.hidden) expanded.delete(key); else expanded.add(key);
            update();
          });
          update();
          row.append(toggle);
          build(item.subitems, children, key);
          li.append(children);
        }
        list.append(li);
      });
    };
    this.list.replaceChildren();
    build(items, this.list, '');
    this.ready = true;
    this.summary.setAttribute('aria-disabled', 'false');
    this.label.textContent = 'Choisir une partie';
  }

  setCurrent(href: string) {
    const current = this.entries.find(entry => entry.href === href)
      || this.entries.find(entry => entry.href.split('#')[0] === href.split('#')[0]);
    if (!current) return;
    for (const entry of this.entries) {
      if (entry === current) entry.button.setAttribute('aria-current', 'location');
      else entry.button.removeAttribute('aria-current');
    }
    this.label.textContent = current.label;
    this.disclosure.dataset.currentHref = current.href;
  }
}
