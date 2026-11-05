import { createLightboxZoom } from "./lightbox-zoom";
import { pickAssetSrc } from "./asset-tier";

function downloadUrl(src: string) {
  return src.includes("?") ? `${src}&download` : `${src}?download`;
}

export type LightboxItem = {
  alt: string;
  href?: string | null;
  medium?: string | null;
  large?: string | null;
  xlarge?: string | null;
  original?: string | null;
  originalWidth?: number | null;
  epic?: boolean;
};

let gallery: LightboxItem[] = [];
let catalogGallery: LightboxItem[] = [];
let index = 0;
let bound = false;
const QUALITY_KEY = 'literae-lightbox-quality';
let qualityMax = false;

function restoreQuality() {
  try {
    const cookie = document.cookie.match(/(?:^|; )literae-lightbox-quality=(original|optimized)(?:;|$)/)?.[1];
    const saved = cookie || localStorage.getItem(QUALITY_KEY);
    if (saved === 'original' || saved === 'optimized') qualityMax = saved === 'original';
  } catch { /* Keep the in-page choice when storage is unavailable. */ }
}
function saveQuality() {
  const value = qualityMax ? 'original' : 'optimized';
  try {
    localStorage.setItem(QUALITY_KEY, value);
  } catch { /* Preference still works in this page. */ }
  try {
    // The gallery is also reachable from the main site's home page.
    const shared = location.hostname === 'literae.ch' || location.hostname.endsWith('.literae.ch');
    document.cookie = `${QUALITY_KEY}=${value}; path=/; max-age=31536000; SameSite=Lax${shared ? '; domain=.literae.ch' : ''}`;
  } catch { /* Cookies may also be disabled. */ }
}
let zoom: ReturnType<typeof createLightboxZoom>;
let imageOriginal: string | null = null;
let epicEnabled = false;
let detailMode = false;
let preload: HTMLImageElement | null = null;
let previousOverflow = "";
let returnFocus: HTMLElement | null = null;

function itemSrc(item: LightboxItem, upgraded = false) {
  if ((qualityMax || upgraded) && item.original) return item.original;
  return pickAssetSrc({
    dataset: {
      medium: item.medium || "",
      large: item.large || "",
      xlarge: item.xlarge || "",
      original: item.original || "",
    },
  }, false);
}

function fromEl(el: HTMLElement): LightboxItem {
  return {
    alt: el.getAttribute("data-alt") || el.getAttribute("alt") || "",
    href: el.dataset.href || "",
    medium: el.dataset.medium,
    large: el.dataset.large,
    xlarge: el.dataset.xlarge,
    original: el.dataset.original,
    originalWidth: Number(el.dataset.originalWidth) || null,
    epic: el.dataset.epic === "true",
  };
}

export function setLightboxGallery(items: LightboxItem[]) {
  catalogGallery = items.filter(hasImage);
}

function hasImage(item: LightboxItem) {
  return Boolean(item.medium || item.large || item.xlarge || item.original);
}

// A sampled S-curve, evaluated by the browser's SVG filter rather than JS pixels.
// Preserve black, white and midpoint; deepen shadows and lift highlights smoothly.
const epicCurve = Array.from({ length: 33 }, (_, i) => {
  const x = i / 32;
  return (0.2 * x + 0.8 * x * x * (3 - 2 * x)).toFixed(5);
}).join(" ");

function zoomIcon(sign: string) {
  return `<svg viewBox="0 0 28 28" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="11" cy="11" r="7.5"/><circle cx="11" cy="11" r="5.8" opacity=".4"/><path d="m17 17 7 7m-8-6 6 6M7.5 11h7${sign === '+' ? 'M11 7.5v7' : ''}"/></svg>`;
}

function ensureLightbox() {
  let root = document.getElementById("lightbox");
  if (root) return root;
  root = document.createElement("div");
  root.id = "lightbox";
  root.className = "lightbox";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Visionneuse d’art");
  root.tabIndex = -1;
  root.innerHTML = `
    <svg class="lightbox-filter" width="0" height="0" aria-hidden="true" focusable="false">
      <defs><filter id="lightbox-epic-curve" color-interpolation-filters="sRGB">
        <feComponentTransfer>
          <feFuncR type="table" tableValues="${epicCurve}" />
          <feFuncG type="table" tableValues="${epicCurve}" />
          <feFuncB type="table" tableValues="${epicCurve}" />
        </feComponentTransfer>
      </filter></defs>
    </svg>
    <div class="lightbox-top"><div class="lightbox-tools">
      <button type="button" class="lightbox-quality" aria-pressed="false">Qualité originale</button>
      <button type="button" class="lightbox-epic" aria-pressed="false" hidden title="Accentuer les ombres et les lumières">Épique</button>
      <div class="lightbox-zoom" role="group" aria-label="Zoom">
        <button type="button" data-zoom="out" aria-label="Dézoomer">${zoomIcon('-')}</button>
        <output class="lightbox-zoom-level" aria-label="Échelle de l’image" title="100 % : taille réelle de l’original">–</output>
        <button type="button" data-zoom="in" aria-label="Zoomer">${zoomIcon('+')}</button>
        <p class="lightbox-status" role="status" hidden></p>
      </div>
    </div>
    <button type="button" class="lightbox-close" aria-label="Fermer">×</button></div>
    <button type="button" class="lightbox-prev" aria-label="Œuvre précédente">‹</button>
    <div class="lightbox-stage"><img class="lightbox-img" alt="" /></div>
    <button type="button" class="lightbox-next" aria-label="Œuvre suivante">›</button>
    <p class="lightbox-cap">
      <span class="lightbox-cap-center">
      <a class="lightbox-cap-link" href="#"></a>
      <a class="lightbox-dl" hidden aria-label="Télécharger">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M12 4v12"></path>
          <path d="M7 11l5 5 5-5"></path>
          <path d="M5 20h14"></path>
        </svg>
      </a>
      </span>
    </p>
  `;
  document.body.appendChild(root);
  zoom = createLightboxZoom(
    root.querySelector<HTMLElement>('.lightbox-stage')!,
    root.querySelector<HTMLImageElement>('.lightbox-img')!,
    root.querySelector<HTMLElement>('.lightbox-zoom-level')!,
    () => {
      if (qualityMax || imageOriginal || !gallery[index]?.original) return false;
      imageOriginal = gallery[index].original!;
      show();
      return true;
    },
    () => gallery[index]?.originalWidth || 0,
  );
  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest(".lightbox-cap-link")) return;
    if (t.closest(".lightbox-dl")) return;
    const zoomButton = t.closest<HTMLElement>('[data-zoom]');
    if (zoomButton) {
      zoom.zoomBy(zoomButton.dataset.zoom === 'in' ? 1.5 : 1 / 1.5);
      return;
    }
    const quality = t.closest<HTMLButtonElement>(".lightbox-quality");
    if (quality) {
      qualityMax = !qualityMax;
      if (!qualityMax) imageOriginal = null;
      saveQuality();
      show();
      return;
    }
    if (t.closest(".lightbox-epic")) {
      epicEnabled = !epicEnabled;
      show();
      return;
    }
    if (t.closest('.lightbox-close')) { closeLightbox(); return; }
    if (t.closest('.lightbox-top, .lightbox-cap')) return;
    if (t.classList.contains("lightbox-prev")) {
      step(-1);
      return;
    }
    if (t.classList.contains("lightbox-next")) {
      step(1);
      return;
    }
    const img = root.querySelector<HTMLImageElement>(".lightbox-img");
    if (img && t.closest(".lightbox-stage") && clickOnPaintedImage(img, e)) return;
    closeLightbox();
  });
  return root;
}

function show() {
  const item = gallery[index];
  const root = ensureLightbox();
  if (!item) return;
  const img = root.querySelector<HTMLImageElement>(".lightbox-img");
  const cap = root.querySelector<HTMLElement>(".lightbox-cap");
  const prev = root.querySelector<HTMLElement>(".lightbox-prev");
  const next = root.querySelector<HTMLElement>(".lightbox-next");
  const quality = root.querySelector<HTMLButtonElement>(".lightbox-quality");
  const epic = root.querySelector<HTMLButtonElement>(".lightbox-epic");
  root.classList.toggle("lightbox-detail", detailMode);
  if (img) {
    const src = itemSrc(item, Boolean(imageOriginal));
    // Install before src, including cache hits. Do not reload on effect toggles.
    const status = root.querySelector<HTMLElement>('.lightbox-status')!;
    img.onload = () => {
      root.setAttribute('aria-busy', 'false');
      status.hidden = true;
      zoom.loaded();
      preloadNext();
    };
    img.onerror = () => {
      root.setAttribute('aria-busy', 'false');
      status.textContent = 'L’image n’a pas pu être chargée.';
      status.hidden = false;
    };
    if (img.getAttribute("src") !== src) {
      root.setAttribute('aria-busy', 'true');
      status.textContent = (qualityMax || imageOriginal) ? 'Chargement de l’original…' : 'Chargement de l’image…';
      status.hidden = false;
      img.src = src;
    }
    img.alt = item.alt;
    img.classList.toggle("is-epic", Boolean(item.epic && epicEnabled));
    if (img.complete && img.naturalWidth) {
      status.hidden = true;
      root.setAttribute('aria-busy', 'false');
      zoom.loaded();
      preloadNext();
    }
  }
  if (cap) cap.hidden = detailMode;
  const link = root.querySelector<HTMLAnchorElement>(".lightbox-cap-link");
  if (link) {
    link.textContent = item.alt;
    if (item.href) {
      link.href = item.href;
      link.classList.add("is-link");
    } else {
      link.removeAttribute("href");
      link.classList.remove("is-link");
    }
  } else if (cap) {
    cap.textContent = item.alt;
  }
  const dl = root.querySelector<HTMLAnchorElement>(".lightbox-dl");
  if (dl) {
    if (item.original && !detailMode) {
      dl.href = downloadUrl(item.original);
      dl.hidden = false;
    } else {
      dl.removeAttribute("href");
      dl.hidden = true;
    }
  }
  const many = !detailMode && gallery.length > 1;
  if (epic) {
    epic.hidden = !item.epic;
    epic.setAttribute("aria-pressed", String(Boolean(item.epic && epicEnabled)));
  }
  if (quality) {
    quality.hidden = !item.original;
    quality.setAttribute("aria-pressed", String(qualityMax));
    quality.classList.toggle("is-active", qualityMax);
  }
  if (prev) prev.hidden = !many;
  if (next) next.hidden = !many;
  root.hidden = false;
  if (document.activeElement instanceof HTMLElement && document.activeElement.hidden) {
    root.querySelector<HTMLButtonElement>(".lightbox-close")?.focus();
  }
}

function preloadNext() {
  if (detailMode || gallery.length < 2) return;
  const src = itemSrc(gallery[(index + 1) % gallery.length]);
  if (!src || preload?.getAttribute("src") === src) return;
  // Keep only the next image alive. Original files are requested only on opt-in.
  preload?.removeAttribute("src");
  preload = new Image();
  preload.decoding = "async";
  preload.fetchPriority = "low";
  preload.src = src;
}

export function openLightbox(el: HTMLElement) {
  restoreQuality();
  ensureLightbox();
  const current = fromEl(el);
  if (current.original !== imageOriginal) imageOriginal = null;
  zoom.reset();
  returnFocus = el;
  detailMode = el.dataset.lightboxMode === "detail";
  const scope = el.closest("[data-lightbox-gallery]") ||
    (!catalogGallery.length ? el.closest(".catalog-grid") : null);
  const serialized = scope?.querySelector<HTMLScriptElement>('script[data-lightbox-items]');
  gallery = detailMode ? [current] : serialized
    ? (JSON.parse(serialized.textContent || '[]') as LightboxItem[]).filter(hasImage)
    : scope ? [...scope.querySelectorAll<HTMLElement>("[data-lightbox]")].map(fromEl).filter(hasImage)
    : catalogGallery;
  index = gallery.findIndex((item) =>
    Boolean(current.original && item.original === current.original) ||
    Boolean(current.large && item.large === current.large) ||
    Boolean(current.href && item.href === current.href),
  );
  if (index < 0) {
    // Also works before the static catalog has loaded, or on a standalone card.
    gallery = [current]; index = 0;
  }
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  show();
  ensureLightbox().querySelector<HTMLButtonElement>(".lightbox-close")?.focus();
}

function clickOnPaintedImage(img: HTMLImageElement, e: MouseEvent) {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh) return true;
  const rect = img.getBoundingClientRect();
  const scale = Math.min(rect.width / nw, rect.height / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  const x = rect.left + (rect.width - dw) / 2;
  const y = rect.top + (rect.height - dh) / 2;
  return e.clientX >= x && e.clientX <= x + dw && e.clientY >= y && e.clientY <= y + dh;
}

function step(delta: number) {
  if (detailMode || gallery.length < 2) return;
  imageOriginal = null;
  zoom.reset();
  index = (index + delta + gallery.length) % gallery.length;
  show();
}

export function closeLightbox() {
  const root = document.getElementById("lightbox");
  if (!root) return;
  root.hidden = true;
  zoom.reset();
  const img = root.querySelector<HTMLImageElement>(".lightbox-img");
  if (img) {
    img.onload = img.onerror = null;
    img.removeAttribute("src");
  }
  preload?.removeAttribute("src");
  preload = null;
  gallery = [];
  document.body.style.overflow = previousOverflow;
  returnFocus?.focus();
  returnFocus = null;
}

export function initLightbox() {
  ensureLightbox();
  if (bound) return;
  bound = true;
  document.addEventListener("keydown", (e) => {
    const trigger = (e.target as HTMLElement).closest<HTMLElement>('[data-lightbox][role="button"]');
    if (trigger && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openLightbox(trigger);
      return;
    }
    const root = document.getElementById("lightbox");
    if (!root || root.hidden) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      step(e.key === "ArrowLeft" ? -1 : 1);
    }
    if (e.key === "Tab") {
      const focusable = [...root.querySelectorAll<HTMLElement>(
        'button:not([hidden]), a[href]:not([hidden])',
      )].filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  document.addEventListener("click", (e) => {
    const trigger = (e.target as HTMLElement).closest<HTMLElement>("[data-lightbox]");
    if (!trigger) return;
    e.preventDefault();
    openLightbox(trigger);
  });
}
