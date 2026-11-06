import { PAGE_SIZE } from "./catalog";
import { artworkOrder, artworkOrderPath, orderArtworks } from "./artworks";
import { formatPersonRoles, parsePersonTypes } from "./people";
import { hydrateThumbs } from "./thumbs";
import { setLightboxGallery } from "./lightbox";
import {
  bindCatalogChrome,
  escapeHtml,
  filterCatalog,
  markActiveButtons,
  readFilterParams,
  renderPager,
  selectedTags,
  uncheckTags,
  updateFilterStatus,
  writeFilterParams,
  type FilterMode,
} from "./catalog-ui";

export type CatalogItem = {
  slug: string;
  href: string;
  title: string;
  subtitle?: string | null;
  year?: string | number | null;
  sort?: number | null;
  date_created?: string | null;
  artist?: string | null;
  epic?: boolean;
  thumb: string | null;
  preview?: string;
  dzi?: string;
  tags: string[];
  types?: string[];
  haystack: string;
};

type Options = {
  jsonUrl: string;
  kind: "artwork" | "artist";
};

function lbAttrs(item: CatalogItem) {
  return `data-lightbox data-epic="${item.epic === true}" data-alt="${escapeHtml(item.title)}" data-href="${escapeHtml(item.href)}" data-preview="${escapeHtml(item.preview || "")}" data-dzi="${escapeHtml(item.dzi || "")}"`;
}

function cardHtml(item: CatalogItem, kind: "artwork" | "artist", eager = false) {
  const meta = [item.artist, item.year].filter(Boolean).join(" · ");
  const role = formatPersonRoles(parsePersonTypes(item.types));
  const img = item.thumb
    ? `<img src="${escapeHtml(item.thumb)}" alt="${escapeHtml(item.title)}" class="thumb-img" loading="${eager ? "eager" : "lazy"}" decoding="async" fetchpriority="${eager ? "high" : "low"}" width="400" height="400" />`
    : `<span class="thumb-empty"><img src="/fleur-de-lys.svg" alt="" width="40" height="40" class="size-10 opacity-40" /><span>Pas d’image</span></span>`;
  const zoom =
    kind === "artwork" && item.thumb
      ? `<button type="button" class="thumb-zoom" aria-label="Agrandir : ${escapeHtml(item.title)}" ${lbAttrs(item)}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="M15.5 15.5 21 21"></path></svg></button>`
      : "";
  const image = `<div class="thumb-slot">
    ${kind === "artwork" ? `<a class="thumb-link" href="${escapeHtml(item.href)}" aria-label="Voir : ${escapeHtml(item.title)}"></a>` : ""}
    ${item.thumb ? `<span class="thumb-ph" aria-hidden="true"><img src="/fleur-de-lys.svg" alt="" width="40" height="40" class="size-10 opacity-40" /></span>` : ""}
    ${img}
    ${zoom}
  </div>`;
  if (kind === "artwork") {
    return `<article class="artwork-card catalog-card group">
      ${image}
      <a href="${escapeHtml(item.href)}" class="catalog-card-copy">
        <h2>${escapeHtml(item.title)}</h2>
        ${meta ? `<p>${escapeHtml(String(meta))}</p>` : ""}
      </a>
    </article>`;
  }
  return `<article class="person-card catalog-card group">
    <a href="${escapeHtml(item.href)}" class="block text-inherit no-underline">
    ${image}
    <div class="catalog-card-copy">
      ${role ? `<p class="card-kicker">${escapeHtml(role)}</p>` : ""}
      <h2>${escapeHtml(item.title)}</h2>
      ${item.subtitle ? `<p class="card-description">${escapeHtml(item.subtitle)}</p>` : ""}
    </div>
    </a>
  </article>`;
}

export function initCatalog(opts: Options) {
  const grid = document.getElementById("catalog-grid");
  const empty = document.getElementById("catalog-empty");
  const pager = document.getElementById("catalog-pager");
  const status = document.getElementById("catalog-status");
  const search = document.getElementById("catalog-search") as HTMLInputElement | null;
  if (!grid) return;
  const catalogGrid = grid;

  let items: CatalogItem[] = [];
  const order = artworkOrder(location.pathname);
  const initial = readFilterParams(search);
  let mode: FilterMode = initial.mode;
  let page = initial.page;

  function selectedTypes() {
    return [...document.querySelectorAll<HTMLButtonElement>(".type-filter[aria-pressed='true']")].map(
      (btn) => btn.dataset.type || "",
    ).filter(Boolean);
  }

  function render() {
    const types = selectedTypes();
    const filtered = filterCatalog(items, search?.value || "", selectedTags(), mode).filter((item) =>
      types.length === 0 || types.some((type) => item.types?.includes(type)),
    );
    const list = opts.kind === "artwork"
      ? orderArtworks(filtered, order)
      : filtered;
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (page > pages) page = pages;
    const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const keepSsr =
      catalogGrid.dataset.ssr === "1" &&
      page === 1 &&
      !search?.value.trim() &&
      selectedTags().length === 0 &&
      types.length === 0 &&
      (opts.kind !== "artwork" || catalogGrid.dataset.order === order);
    if (!keepSsr) {
      catalogGrid.removeAttribute("data-ssr");
      catalogGrid.innerHTML = slice.map((item, i) => cardHtml(item, opts.kind, i < 8)).join("");
    }
    hydrateThumbs(catalogGrid);
    if (opts.kind === "artwork") {
      setLightboxGallery(
        list.map((item) => ({
          alt: item.title,
          href: item.href,
          preview: item.preview,
          dzi: item.dzi,
          epic: item.epic,
        })),
      );
    }
    const noun = list.length > 1 ? "résultats" : "résultat";
    updateFilterStatus(
      status,
      empty,
      list.length,
      opts.kind === "artist" ? "Aucune personnalité ne correspond." : "Aucune œuvre ne correspond.",
      `${list.length} ${noun}`,
    );
    markActiveButtons(".mode-btn", "mode", mode);
    renderPager(pager, pages, page);
    writeFilterParams({
      search,
      mode,
      page,
      extra: { types: types.length ? types.join(",") : null },
    });
    document.querySelectorAll<HTMLAnchorElement>('[data-artwork-order]').forEach(link => {
      const next = link.dataset.artworkOrder === 'nouveautes' ? 'nouveautes' : 'selection';
      const url = new URL(artworkOrderPath(next), location.origin);
      url.search = location.search;
      url.searchParams.delete('p');
      link.href = url.href;
    });
    document.documentElement.removeAttribute('data-art-catalog-pending');
  }

  bindCatalogChrome({
    search,
    pager,
    status,
    empty,
    onResetPage() {
      page = 1;
      render();
    },
    onPage(next) {
      page = next;
      render();
      catalogGrid.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    onMode(next) {
      mode = next;
      page = 1;
      render();
    },
    onClearAll() {
      uncheckTags();
      document.querySelectorAll<HTMLButtonElement>(".type-filter").forEach((btn) => {
        btn.setAttribute("aria-pressed", "false");
      });
      if (search) search.value = "";
      page = 1;
      render();
    },
  });

  document.querySelectorAll<HTMLButtonElement>(".type-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      const on = btn.getAttribute("aria-pressed") === "true";
      btn.setAttribute("aria-pressed", on ? "false" : "true");
      page = 1;
      render();
    });
  });

  const initialTypes = new URLSearchParams(location.search).get("types") || "";
  for (const type of parsePersonTypes(initialTypes)) {
    const btn = document.querySelector<HTMLButtonElement>(`.type-filter[data-type="${CSS.escape(type)}"]`);
    if (btn) btn.setAttribute("aria-pressed", "true");
  }

  fetch(opts.jsonUrl)
    .then((res) => res.json())
    .then((data) => {
      items = (data.items || []).map((item: CatalogItem) => ({
        ...item,
        types: parsePersonTypes(item.types),
      }));
      render();
    })
    .catch(() => {
      document.documentElement.removeAttribute('data-art-catalog-pending');
      if (status) status.textContent = 'Les filtres n’ont pas pu être chargés. Rechargez la page pour réessayer.';
    });
}
