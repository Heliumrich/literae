import { PAGE_SIZE } from './catalog';
import { LIBRARY_PATH, bookCardHtml, type BookItem } from './books';
import { bindCatalogChrome, filterCatalog, markActiveButtons, readFilterParams, renderPager, selectedTags,
  uncheckTags, updateFilterStatus, writeFilterParams, type CatalogView, type FilterMode } from './catalog-ui';

export async function initBookCatalog() {
  const grid = document.getElementById('catalog-grid');
  const search = document.getElementById('catalog-search') as HTMLInputElement | null;
  const sort = document.getElementById('book-sort') as HTMLSelectElement;
  const pager = document.getElementById('catalog-pager');
  const status = document.getElementById('catalog-status');
  const empty = document.getElementById('catalog-empty');
  if (!grid) return;
  const initial = readFilterParams(search);
  let { page, view } = initial;
  let mode: FilterMode = initial.mode;
  const savedSort = new URLSearchParams(location.search).get('sort');
  if (savedSort && ['title', 'author', 'tags'].includes(savedSort)) sort.value = savedSort;
  let items: BookItem[] = [];
  const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
  function render() {
    const list = filterCatalog(items, search?.value || '', selectedTags(), mode);
    // The static catalogue already follows Directus' editorial order.
    if (sort.value !== 'default') list.sort((a, b) => {
      const key = sort.value === 'author' ? 'author' : sort.value === 'tags' ? 'tags' : 'title';
      return collator.compare(String(a[key]), String(b[key])) || collator.compare(a.title, b.title);
    });
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    page = Math.min(page, pages);
    grid!.innerHTML = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(item => bookCardHtml(item)).join('');
    grid!.classList.toggle('is-list', view === 'list');
    markActiveButtons('.view-btn', 'view', view);
    markActiveButtons('.mode-btn', 'mode', mode);
    updateFilterStatus(status, empty, list.length, 'Aucun ouvrage ne correspond.', `${list.length} ouvrage${list.length > 1 ? 's' : ''}`);
    renderPager(pager, pages, page);
    writeFilterParams({ search, mode, page, extra: { view: view === 'list' ? view : null, sort: sort.value === 'default' ? null : sort.value } });
  }
  function resetPage() { page = 1; render(); }
  bindCatalogChrome({ search, pager, status, empty, onResetPage: resetPage,
    onPage(next) { page = next; render(); grid!.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    onMode(next) { mode = next; resetPage(); },
    onView(next: CatalogView) { view = next; render(); },
    onClearAll() { uncheckTags(); if (search) search.value = ''; resetPage(); },
  });
  sort.addEventListener('change', resetPage);
  try {
    const response = await fetch(`${LIBRARY_PATH}.json`);
    if (!response.ok) throw new Error('Catalogue indisponible');
    items = (await response.json()).items;
    render();
  } catch {
    if (status) status.textContent = 'Les filtres sont indisponibles. Rechargez la page pour réessayer.';
  }
}
