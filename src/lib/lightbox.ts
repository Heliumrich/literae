import type OpenSeadragon from 'openseadragon';
import { DEZOOMIFY_URL } from './art-media';

export type LightboxItem = {
  alt: string;
  href?: string;
  preview?: string;
  dzi?: string;
  epic?: boolean;
};

let catalog: LightboxItem[] = [];
let gallery: LightboxItem[] = [];
let index = 0;
let detail = false;
let epicEnabled = false;
let viewer: OpenSeadragon.Viewer | undefined;
let generation = 0;
let preload: HTMLImageElement | undefined;
let trigger: HTMLElement | null = null;
let previousOverflow = '';
let bound = false;

const curve = Array.from({ length: 33 }, (_, i) => {
  const x = i / 32;
  return (0.2 * x + 0.8 * x * x * (3 - 2 * x)).toFixed(5);
}).join(' ');

function fromElement(element: HTMLElement): LightboxItem {
  const { alt, href, preview, dzi, epic } = element.dataset;
  return { alt: alt || '', href, preview, dzi, epic: epic === 'true' };
}

export function setLightboxGallery(items: LightboxItem[]) {
  catalog = items.filter(item => item.dzi);
}

function ensureLightbox() {
  const existing = document.getElementById('lightbox');
  if (existing) return existing;
  const root = document.createElement('div');
  root.id = 'lightbox';
  root.className = 'lightbox';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Visionneuse d’art');
  root.innerHTML = `
    <svg class="lightbox-filter" width="0" height="0" aria-hidden="true" focusable="false">
      <defs><filter id="lightbox-epic-curve" color-interpolation-filters="sRGB"><feComponentTransfer>
        <feFuncR type="table" tableValues="${curve}" />
        <feFuncG type="table" tableValues="${curve}" />
        <feFuncB type="table" tableValues="${curve}" />
      </feComponentTransfer></filter></defs>
    </svg>
    <div class="lightbox-top">
      <div class="lightbox-tools">
        <button type="button" class="lightbox-epic" aria-pressed="false" hidden>Épique</button>
        <div class="lightbox-zoom" role="group" aria-label="Zoom">
          <button type="button" data-zoom="out" aria-label="Dézoomer">−</button>
          <output class="lightbox-zoom-level" aria-label="Échelle de l’image">–</output>
          <button type="button" data-zoom="in" aria-label="Zoomer">+</button>
          <button type="button" data-zoom="home" aria-label="Ajuster à l’écran">↺</button>
          <p class="lightbox-status" role="status" hidden></p>
        </div>
      </div>
      <button type="button" class="lightbox-close" aria-label="Fermer">×</button>
    </div>
    <button type="button" class="lightbox-prev" aria-label="Œuvre précédente">‹</button>
    <div class="lightbox-stage">
      <img class="lightbox-img" alt="" />
      <div class="lightbox-viewer" role="img"></div>
    </div>
    <button type="button" class="lightbox-next" aria-label="Œuvre suivante">›</button>
    <p class="lightbox-cap"><span class="lightbox-cap-center">
      <a class="lightbox-cap-link"></a>
      <a class="lightbox-dl" href="${DEZOOMIFY_URL}" target="_blank" rel="noopener noreferrer" aria-label="Télécharger avec Dezoomify" title="Télécharger avec Dezoomify">↓</a>
    </span></p>
  `;
  document.body.appendChild(root);
  root.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    if (target.closest('.lightbox-close')) closeLightbox();
    if (target.closest('.lightbox-prev')) step(-1);
    if (target.closest('.lightbox-next')) step(1);
    if (target.closest('.lightbox-epic')) {
      epicEnabled = !epicEnabled;
      updateEpic(root);
    }
    const button = target.closest<HTMLElement>('[data-zoom]');
    const viewport = viewer?.viewport;
    if (button && viewport && viewer?.world.getItemCount()) {
      if (button.dataset.zoom === 'home') viewport.goHome();
      else viewport.zoomBy(button.dataset.zoom === 'in' ? 1.5 : 1 / 1.5);
      viewport.applyConstraints();
    }
  });
  return root;
}

function updateEpic(root: HTMLElement) {
  const epic = root.querySelector<HTMLButtonElement>('.lightbox-epic')!;
  const available = Boolean(gallery[index]?.epic);
  if (!available && document.activeElement === epic) root.querySelector<HTMLButtonElement>('.lightbox-close')?.focus();
  epic.hidden = !available;
  epic.setAttribute('aria-pressed', String(available && epicEnabled));
  root.querySelector('.lightbox-stage')?.classList.toggle('is-epic', available && epicEnabled);
}

function preloadNext() {
  if (detail || gallery.length < 2 || preload) return;
  const next = gallery[(index + 1) % gallery.length];
  if (!next.preview) return;
  preload = new Image();
  preload.fetchPriority = 'low';
  preload.src = next.preview;
}

function stopViewer() {
  generation++;
  viewer?.destroy();
  viewer = undefined;
  preload?.removeAttribute('src');
  preload = undefined;
}

async function show() {
  stopViewer();
  const request = generation;
  const item = gallery[index];
  if (!item?.dzi) return;
  const root = ensureLightbox();
  const preview = root.querySelector<HTMLImageElement>('.lightbox-img')!;
  const stage = root.querySelector<HTMLElement>('.lightbox-viewer')!;
  const output = root.querySelector<HTMLOutputElement>('.lightbox-zoom-level')!;
  const status = root.querySelector<HTMLElement>('.lightbox-status')!;
  const link = root.querySelector<HTMLAnchorElement>('.lightbox-cap-link')!;
  root.classList.toggle('lightbox-detail', detail);
  root.querySelector<HTMLElement>('.lightbox-cap')!.hidden = detail;
  for (const selector of ['.lightbox-prev', '.lightbox-next']) {
    root.querySelector<HTMLElement>(selector)!.hidden = detail || gallery.length < 2;
  }
  link.textContent = item.alt;
  if (item.href) link.href = item.href;
  else link.removeAttribute('href');
  link.classList.toggle('is-link', Boolean(item.href));
  preview.alt = item.alt;
  preview.hidden = !item.preview;
  if (item.preview) preview.src = item.preview;
  else preview.removeAttribute('src');
  updateEpic(root);
  output.value = '–';
  status.textContent = 'Chargement de l’image…';
  status.hidden = false;
  stage.style.opacity = '0';
  stage.setAttribute('aria-label', item.alt);
  root.setAttribute('aria-busy', 'true');
  root.hidden = false;

  const finish = (message?: string) => {
    if (request !== generation) return;
    root.setAttribute('aria-busy', 'false');
    status.hidden = !message;
    if (message) status.textContent = message;
  };
  const failed = () => finish('La visionneuse n’a pas pu charger les tuiles.');
  try {
    const { default: OpenSeadragon } = await import('openseadragon');
    if (request !== generation) return;
    const current = OpenSeadragon({
      element: stage,
      drawer: 'canvas',
      showNavigationControl: false,
      showSequenceControl: false,
      keyboardNavEnabled: false,
      imageLoaderLimit: 4,
      maxImageCacheCount: 48,
      maxZoomPixelRatio: 1,
      animationTime: .22,
      blendTime: 0,
      timeout: 15_000,
      gestureSettingsMouse: { clickToZoom: false },
    });
    viewer = current;
    current.addHandler('open-failed', failed);
    current.addHandler('tile-load-failed', () => {
      if (!preview.hidden) failed();
    });
    current.addHandler('fully-loaded-change', event => {
      if (request !== generation || !event.fullyLoaded) return;
      stage.style.opacity = '1';
      preview.hidden = true;
      finish();
      preloadNext();
    });
    const updateScale = () => {
      if (request !== generation || !current.world.getItemCount()) return;
      const scale = current.viewport.viewportToImageZoom(current.viewport.getZoom());
      output.value = `${Math.max(1, Math.round(scale * 100))} %`;
    };
    current.addHandler('open', updateScale);
    current.addHandler('animation', updateScale);
    current.addHandler('resize', updateScale);
    current.open({ tileSource: item.dzi });
  } catch {
    if (request === generation) failed();
  }
}

function openLightbox(element: HTMLElement) {
  const current = fromElement(element);
  if (!current.dzi) return;
  detail = element.dataset.lightboxMode === 'detail';
  const scope = element.closest('[data-lightbox-gallery]') ||
    (!catalog.length ? element.closest('.catalog-grid') : null);
  const serialized = scope?.querySelector<HTMLScriptElement>('script[data-lightbox-items]');
  gallery = detail ? [current] : serialized
    ? (JSON.parse(serialized.textContent || '[]') as LightboxItem[])
    : scope ? [...scope.querySelectorAll<HTMLElement>('[data-lightbox]')].map(fromElement)
    : catalog;
  gallery = gallery.filter(item => item.dzi);
  index = gallery.findIndex(item => item.dzi === current.dzi && item.href === current.href);
  if (index < 0) { gallery = [current]; index = 0; }
  trigger = element;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  void show();
  ensureLightbox().querySelector<HTMLButtonElement>('.lightbox-close')?.focus();
}

function step(direction: number) {
  if (detail || gallery.length < 2) return;
  index = (index + direction + gallery.length) % gallery.length;
  void show();
}

function closeLightbox() {
  const root = document.getElementById('lightbox');
  if (!root || root.hidden) return;
  stopViewer();
  root.hidden = true;
  root.querySelector('.lightbox-img')?.removeAttribute('src');
  gallery = [];
  document.body.style.overflow = previousOverflow;
  trigger?.focus();
  trigger = null;
}

export function initLightbox() {
  if (bound) return;
  bound = true;
  document.addEventListener('click', event => {
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-lightbox][data-dzi]');
    if (!element) return;
    event.preventDefault();
    openLightbox(element);
  });
  document.addEventListener('keydown', event => {
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-lightbox][data-dzi][role="button"]');
    if (element && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      openLightbox(element);
      return;
    }
    const root = document.getElementById('lightbox');
    if (!root || root.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      step(event.key === 'ArrowLeft' ? -1 : 1);
    }
    if (event.key === 'Tab') {
      const controls = [...root.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]')]
        .filter(control => control.offsetParent !== null);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
}
