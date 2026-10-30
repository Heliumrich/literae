import { matchesQuery } from "./catalog";

export type FilterMode = "and" | "or";
export type CatalogView = "grid" | "list";

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function selectedTags() {
  return [...document.querySelectorAll<HTMLInputElement>(".tag-filter:checked")].map(
    (input) => input.value,
  );
}

export function uncheckTags() {
  document.querySelectorAll<HTMLInputElement>(".tag-filter").forEach((input) => {
    input.checked = false;
  });
}

export function filterCatalog<T extends { haystack: string; tags: string[] }>(
  items: T[],
  query: string,
  tags: string[],
  mode: FilterMode,
) {
  return items.filter((item) => {
    if (!matchesQuery(item.haystack, query)) return false;
    if (!tags.length) return true;
    return mode === "or"
      ? tags.some((tag) => item.tags.includes(tag))
      : tags.every((tag) => item.tags.includes(tag));
  });
}

export function readFilterParams(search: HTMLInputElement | null) {
  const params = new URLSearchParams(location.search);
  if (search && params.get("q")) search.value = params.get("q") || "";
  for (const tag of (params.get("tags") || "").split(",").filter(Boolean)) {
    const input = document.querySelector<HTMLInputElement>(
      `.tag-filter[value="${CSS.escape(tag)}"]`,
    );
    if (input) input.checked = true;
  }
  return {
    mode: (params.get("mode") === "or" ? "or" : "and") as FilterMode,
    page: Math.max(1, Math.floor(Number(params.get("p") || "1")) || 1),
    view: (params.get("view") === "list" ? "list" : "grid") as CatalogView,
  };
}

function setParam(url: URL, key: string, value: string | null) {
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
}

export function writeFilterParams(opts: {
  search: HTMLInputElement | null;
  mode: FilterMode;
  page: number;
  extra?: Record<string, string | null>;
  pathname?: string;
}) {
  const url = new URL(location.href);
  const tags = selectedTags();
  setParam(url, "q", opts.search?.value.trim() || null);
  setParam(url, "tags", tags.length ? tags.join(",") : null);
  setParam(url, "mode", opts.mode === "or" && tags.length ? "or" : null);
  if (opts.pathname) url.pathname = opts.pathname;
  setParam(url, "p", !opts.pathname && opts.page > 1 ? String(opts.page) : null);
  if (opts.extra) {
    for (const [key, value] of Object.entries(opts.extra)) setParam(url, key, value);
  }
  history.replaceState(null, "", url);
}

export function markActiveButtons(selector: string, dataKey: string, current: string) {
  document.querySelectorAll(selector).forEach((btn) => {
    const active = (btn as HTMLElement).dataset[dataKey] === current;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

export function renderPager(pager: HTMLElement | null, pages: number, page: number, href?: (page: number) => string) {
  if (!pager) return;
  if (pages <= 1) {
    pager.innerHTML = "";
    return;
  }
  pager.innerHTML = Array.from({ length: pages }, (_, i) => {
    const n = i + 1;
    const current = n === page;
    if (href) return `<a href="${escapeHtml(href(n))}" class="catalog-page ${current ? "is-active" : ""}" aria-label="Page ${n}"${current ? ' aria-current="page"' : ''}>${n}</a>`;
    return `<button type="button" data-page="${n}" class="catalog-page ${current ? "is-active" : ""}" aria-current="${current ? "page" : "false"}">${n}</button>`;
  }).join("");
}

export function updateFilterStatus(
  status: HTMLElement | null,
  empty: HTMLElement | null,
  count: number,
  emptyLabel: string,
  counted: string,
) {
  const search = document.getElementById("catalog-search") as HTMLInputElement | null;
  const tags = selectedTags();
  const typesOn = document.querySelectorAll(".type-filter[aria-pressed='true']").length;
  const hasFilters = tags.length > 0 || !!search?.value.trim() || typesOn > 0;
  const clearBtn = hasFilters
    ? ' <button type="button" class="clear-all-filters underline">Effacer les filtres</button>'
    : "";
  empty?.classList.toggle("hidden", count !== 0);
  if (empty) empty.innerHTML = count ? "" : `${emptyLabel}${clearBtn}`;
  if (status) {
    status.innerHTML = count ? `${counted}${hasFilters ? ` <button type="button" class="clear-all-filters ml-3 underline">Effacer les filtres</button>` : ""}` : "";
  }
  const countEl = document.getElementById("tag-count");
  if (countEl) {
    countEl.textContent = String(tags.length);
    countEl.classList.toggle("hidden", tags.length === 0);
  }
}

export function bindCatalogChrome(opts: {
  search: HTMLInputElement | null;
  pager: HTMLElement | null;
  status: HTMLElement | null;
  empty: HTMLElement | null;
  onResetPage: () => void;
  onPage: (page: number) => void;
  onMode?: (mode: FilterMode) => void;
  onView?: (view: CatalogView) => void;
  onClearTags?: () => void;
  onClearAll: () => void;
}) {
  const toggle = document.getElementById("tag-toggle");
  const panel = document.getElementById("tag-panel");

  toggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = !panel?.classList.contains("hidden");
    panel?.classList.toggle("hidden", open);
    toggle.setAttribute("aria-expanded", String(!open));
    if (!open) panel?.querySelector<HTMLInputElement>("input")?.focus();
  });
  document.addEventListener("click", (event) => {
    if (!document.getElementById("tag-dropdown")?.contains(event.target as Node)) {
      panel?.classList.add("hidden");
      toggle?.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || panel?.classList.contains("hidden")) return;
    panel?.classList.add("hidden");
    toggle?.setAttribute("aria-expanded", "false");
    toggle?.focus();
  });

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      opts.onMode?.((btn as HTMLElement).dataset.mode === "or" ? "or" : "and");
    });
  });
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      opts.onView?.((btn as HTMLElement).dataset.view === "list" ? "list" : "grid");
    });
  });
  document.querySelectorAll(".tag-filter").forEach((el) => {
    el.addEventListener("change", opts.onResetPage);
  });
  document.getElementById("tag-clear")?.addEventListener("click", () => {
    uncheckTags();
    (opts.onClearTags ?? opts.onResetPage)();
  });

  const onClearAll = (event: Event) => {
    if ((event.target as HTMLElement).closest(".clear-all-filters")) opts.onClearAll();
  };
  opts.status?.addEventListener("click", onClearAll);
  opts.empty?.addEventListener("click", onClearAll);

  let timer = 0;
  opts.search?.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(opts.onResetPage, 120);
  });
  opts.pager?.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest("[data-page]") as HTMLElement | null;
    if (!btn) return;
    opts.onPage(Number(btn.dataset.page));
  });
}
