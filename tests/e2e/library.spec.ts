import { test, expect, devices, type Page, type Frame } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const LIBRARY = '/scriptorium/bibliotheque';
const MAIN_ORIGIN = 'https://literae.ch';
const LOCAL_ORIGIN = 'http://127.0.0.1:4322';
let bookPath: string;
let bookId: string;
let catalogCount: number;
let theologyCount: number;

// Keep the real production origin for CORS. Only the site's HTML/assets come
// from our local build; EPUB requests reach the public Directus server unchanged.
test.use({
  baseURL: MAIN_ORIGIN,
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {}),
});
const localUrl = (url: string) => {
  const parsed = new URL(url);
  return LOCAL_ORIGIN + parsed.pathname + parsed.search;
};
test.beforeEach(async ({ context }) => {
  await context.route(`${MAIN_ORIGIN}/**`, async route => {
    const response = await route.fetch({ url: localUrl(route.request().url()) });
    await route.fulfill({ response });
  });
});

test.beforeAll(async ({ request }) => {
  const response = await request.get(`${LOCAL_ORIGIN}${LIBRARY}.json`);
  const { items } = await response.json();
  expect(items.length).toBeGreaterThan(0);
  const confessions = items.find((item: { title: string }) => item.title === 'Confessions');
  bookPath = confessions.href;
  bookId = confessions.id;
  catalogCount = items.length;
  theologyCount = items.filter((item: { tags: string[] }) => item.tags.includes('Théologie')).length;
});

async function openBook(page: Page) {
  await page.goto(bookPath);
  await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('[data-reader="error"]')).toBeHidden();
  await expect(page.locator('[data-reader="toc"]')).toBeEnabled();
  await expect(page.locator('[data-reader="note-dialog"]')).toHaveCount(0);
  const id = await page.locator('[data-reader="edition"]').inputValue();
  await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`literae-epub-progress-v2:${id}`) || '{}').cfi, id)).toMatch(/^epubcfi\(/);
}
async function goToSection(page: Page, text: string) {
  const id = await page.locator('[data-reader="edition"]').inputValue();
  const savedCfi = () => page.evaluate(id => JSON.parse(localStorage.getItem(`literae-epub-progress-v2:${id}`) || '{}').cfi, id);
  const previous = await savedCfi();
  const option = page.locator('[data-reader="toc"] option').filter({ hasText: new RegExp(`^${text}$`) });
  await page.locator('[data-reader="toc"]').selectOption((await option.getAttribute('value'))!);
  await expect.poll(savedCfi).not.toBe(previous);
}
async function textFrame(page: Page, heading: string): Promise<Frame> {
  let found: Frame | undefined;
  await expect.poll(async () => {
    for (const frame of page.frames().slice(1)) {
      try { if (await frame.getByRole('heading', { name: heading, exact: true }).count()) { found = frame; return true; } } catch { /* A previous section may have just been removed. */ }
    }
    return false;
  }).toBe(true);
  return found!;
}

test('navigation, nouveautés, filtres, grille/liste et tri', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#recent-books-title')).toBeVisible();
  await expect(page.locator('.recent-books .book-card')).toHaveCount(Math.min(4, catalogCount));
  await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click();
  const link = page.locator('#mobile-nav').getByRole('link', { name: 'Bibliothèque' });
  await expect(link).toHaveAttribute('href', `https://literae.ch${LIBRARY}`);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}$`));
  await expect(page.locator('#catalog-status')).toContainText(`${catalogCount} ouvrage`);
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await expect(page.locator('#catalog-grid')).toHaveClass(/is-list/);
  await page.locator('#book-sort').selectOption('author');
  await expect(page).toHaveURL(/sort=author/);
  await page.getByRole('button', { name: 'Filtrer', exact: true }).click();
  await page.getByLabel('Théologie', { exact: true }).check();
  await expect(page.locator('#catalog-grid .book-card')).toHaveCount(theologyCount);
  await page.locator('#catalog-search').fill('aucun-livre');
  await expect(page.locator('#catalog-grid .book-card')).toHaveCount(0);
  await expect(page.locator('#catalog-empty')).toContainText('Aucun ouvrage');
  await page.getByRole('button', { name: 'Effacer les filtres', exact: true }).click();
  await expect(page.locator('#catalog-grid .book-card')).toHaveCount(catalogCount);
  const person = await page.request.get(`${LOCAL_ORIGIN}/personalites/aurelius-augustinus`);
  expect(await person.text()).toContain('Ouvrages de Augustin');
  expect(await person.text()).toContain(`https://literae.ch${bookPath}`);
});

test('préserve la couverture et épure le plein écran sans recréer les pages au scroll', async ({ page }) => {
  await openBook(page);
  let cover: Frame | undefined;
  for (const f of page.frames().slice(1)) if (await f.locator('.cover-bg, .literae-cover').count()) cover = f;
  expect(cover).toBeTruthy();
  const height = await page.locator('[data-reader="viewport"]').evaluate(el => el.clientHeight);
  await expect.poll(() => cover!.locator('body').evaluate(el => el.getBoundingClientRect().height)).toBe(height);
  if (await cover!.locator('.literae-cover').count()) {
    await expect(cover!.locator('svg text').first()).toHaveAttribute('fill', '#302719');
    await expect(cover!.locator('svg text').first()).toHaveAttribute('text-anchor', 'middle');
    const boxes = await cover!.locator('svg text').evaluateAll(els => els.slice(0, 2).map(el => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom })));
    expect(boxes[1].top).toBeGreaterThan(boxes[0].bottom);
  } else {
    await expect(cover!.locator('.title-top')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(cover!.locator('.title-top')).toHaveCSS('text-align', 'center');
  }
  await cover!.evaluate(() => { (window as any).__coverRetained = true; });
  await page.evaluate(() => { window.scrollBy(0, 100); window.dispatchEvent(new Event('resize')); });
  await page.waitForTimeout(250); // EPUB.js previously throttled its window resize handler.
  expect(await cover!.evaluate(() => (window as any).__coverRetained)).toBe(true);
  await page.locator('[data-reader="fullscreen"]').click();
  await expect(page.locator('.reader-toolbar')).toBeHidden();
  await expect(page.locator('.reader-download')).toBeHidden();
  await expect(page.locator('.reader-footer')).toBeVisible();
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.locator('.reader-toolbar')).toBeVisible();
});

test('aligne les outils et contient les intitulés longs sur mobile et ordinateur', async ({ page }) => {
  await openBook(page);
  await page.locator('[data-reader="toc"] option').first().evaluate(el => { el.textContent = 'Livre premier — ' + 'Un très long intitulé de chapitre '.repeat(20); });
  for (const width of [360, 393, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const edition = await page.locator('[data-reader="edition"]').boundingBox();
    const toc = await page.locator('[data-reader="toc"]').boundingBox();
    const settings = await page.locator('.reader-settings summary').boundingBox();
    expect(edition!.height).toBe(toc!.height);
    expect(settings!.height).toBe(toc!.height);
    if (width <= 600) expect(edition!.x).toBe(toc!.x);
    else expect(edition!.y).toBe(toc!.y);
    const bar = await page.locator('.reader-toolbar').boundingBox();
    expect(bar!.height).toBeLessThan(width <= 600 ? 150 : 90);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.locator('.reader-toolbar').screenshot({ path: `/tmp/reader-toolbar-${width}.png` });
  }
  await page.locator('.reader-settings summary').click();
  await expect(page.locator('[data-reader="font"]')).toBeVisible();
});

test('permet de réessayer après un échec de téléchargement de l’EPUB', async ({ page }) => {
  await page.route('https://api.literae.ch/assets/**', route => route.abort('internetdisconnected'));
  await page.goto(bookPath);
  await expect(page.locator('[data-reader="error"]')).toBeVisible();
  await page.unroute('https://api.literae.ch/assets/**');
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('[data-reader="error"]')).toBeHidden();
  await expect(page.locator('[data-reader="toc"]')).toBeEnabled();
});

test('récupère l’ancien signet uniquement pour son fichier d’origine', async ({ page }) => {
  await openBook(page);
  await goToSection(page, 'Livre troisième');
  await textFrame(page, 'Livre troisième');
  const id = await page.locator('[data-reader="edition"]').inputValue();
  await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`literae-epub-progress-v2:${id}`) || '{}').cfi, id)).toMatch(/^epubcfi\(/);
  const progress = await page.evaluate(id => JSON.parse(localStorage.getItem(`literae-epub-progress-v2:${id}`)!), id);
  await page.addInitScript(({ id, bookId, progress }) => {
    const key = `literae-epub-progress-v2:${id}`;
    localStorage.setItem(`literae-book-progress-v1:${bookId}`, JSON.stringify({ ...progress,
      edition: `/scriptorium/bibliotheque/fichiers/${id}-123abc456def.epub`,
    }));
    localStorage.removeItem(key);
  }, { id, bookId, progress });
  await page.reload();
  await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('[data-reader="toc"] option:checked')).toHaveText('Livre troisième');
});

for (const device of ['Desktop Chrome', 'Pixel 7']) {
  test.describe(`Lecture EPUB : ${device}`, () => {
    const profile = devices[device];
    test.use({ viewport: profile.viewport, userAgent: profile.userAgent, isMobile: profile.isMobile, hasTouch: profile.hasTouch, deviceScaleFactor: profile.deviceScaleFactor });

    test('lit le vrai EPUB, adapte le texte et charge les polices à la sélection', async ({ page }) => {
      const fontRequests: string[] = [];
      const errors: string[] = [];
      page.on('request', request => { if (request.url().includes('/reader-fonts/')) fontRequests.push(request.url()); });
      page.on('pageerror', error => errors.push(error.message));
      const epubResponse = page.waitForResponse(response => response.url().startsWith('https://api.literae.ch/assets/') && response.request().resourceType() === 'fetch');
      await openBook(page);
      const response = await epubResponse;
      expect(response.status()).toBe(200);
      expect(await response.headerValue('access-control-allow-origin')).toBe(MAIN_ORIGIN);
      const headers = await response.request().allHeaders();
      expect(headers.origin).toBe(MAIN_ORIGIN);
      expect(headers.authorization).toBeUndefined();
      expect(headers.cookie).toBeUndefined();
      await expect(page.locator('[data-reader="toc"] option').filter({ hasText: /^Livre / })).toHaveCount(13);
      await goToSection(page, 'Livre premier');
      const frame = await textFrame(page, 'Livre premier');
      await expect(frame.locator('body')).toContainText('notre coeur est inquiet');
      expect(fontRequests).toHaveLength(0);
      const headingFont = await frame.locator('h2').first().evaluate(node => getComputedStyle(node).fontFamily);
      await page.getByLabel('Réglages de lecture', { exact: true }).click();
      await page.locator('[data-reader="font"]').selectOption('literata');
      await expect.poll(() => frame.locator('p').first().evaluate(node => getComputedStyle(node).fontFamily)).toContain('Literae Literata');
      expect(fontRequests.some(url => url.includes('literata'))).toBe(true);
      expect(fontRequests.some(url => url.includes('lora') || url.includes('libre-baskerville'))).toBe(false);
      expect(await frame.locator('h2').first().evaluate(node => getComputedStyle(node).fontFamily)).toBe(headingFont);
      await page.locator('[data-reader="size"]').fill('25');
      await page.locator('[data-reader="margin"]').fill('48');
      await page.locator('[data-reader="justify"]').check();
      await expect(page.locator('[data-reader="hyphenate"]')).toBeChecked();
      await page.locator('[data-reader="hyphenate"]').uncheck();
      await expect.poll(() => frame.locator('p').first().evaluate(node => getComputedStyle(node).hyphens)).toBe('none');
      await page.locator('[data-reader="palette"]').selectOption('oled');
      await expect.poll(() => frame.locator('body').evaluate(node => {
        const s = getComputedStyle(node); return [s.backgroundColor, s.color, s.fontSize, s.paddingLeft];
      })).toEqual(['rgb(0, 0, 0)', 'rgb(231, 225, 215)', '25px', '48px']);
      await expect.poll(() => frame.locator('p').first().evaluate(node => getComputedStyle(node).textAlign)).toBe('justify');
      await page.locator('[data-reader="palette"]').selectOption('auto');
      await page.getByRole('button', { name: 'Activer le thème sombre', exact: true }).click();
      await expect.poll(() => frame.locator('body').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(23, 21, 19)');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      expect(overflow).toBe(false);
      expect(await frame.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      if (device === 'Pixel 7') {
        await page.setViewportSize({ width: 915, height: 412 });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      }
      expect(errors).toEqual([]);
    });

    test('reprend le livre après fermeture et conserve les réglages', async ({ page, context }) => {
      await openBook(page);
      await goToSection(page, 'Livre cinquième');
      await textFrame(page, 'Livre cinquième');
      await page.getByLabel('Réglages de lecture', { exact: true }).click();
      await page.locator('[data-reader="size"]').fill('24');
      await page.locator('[data-reader="hyphenate"]').uncheck();
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('literae-reader-settings-v1') || '{}').size)).toBe(24);
      const id = await page.locator('[data-reader="edition"]').inputValue();
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`literae-epub-progress-v2:${id}`) || '{}').cfi, id)).toMatch(/^epubcfi\(/);
      await page.close();
      const reopened = await context.newPage();
      await openBook(reopened);
      await expect(reopened.locator('[data-reader="toc"] option:checked')).toHaveText('Livre cinquième');
      await expect(reopened.locator('[data-reader="size"]')).toHaveValue('24');
      await expect(reopened.locator('[data-reader="hyphenate"]')).not.toBeChecked();
      await expect(reopened.locator('[data-reader="progress"]')).toContainText('%');
    });

    test('garde un signet distinct par fichier, même avec des noms et des UUID partiellement identiques', async ({ page }) => {
      const downloads: string[] = [];
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const editions = ['11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111112'].map((id, index) => ({
        id, label: `Traduction ${index === 0 ? 'A' : 'B'}`, url: `https://api.literae.ch/assets/${id}/meme-nom.epub?v=test`, size: 1000,
      }));
      const [a, b] = editions;
      const savedCfi = (id: string) => page.evaluate(id => JSON.parse(localStorage.getItem(`literae-epub-progress-v2:${id}`) || '{}').cfi, id);
      await page.route(`**${bookPath}`, async route => {
        const response = await route.fetch({ url: LOCAL_ORIGIN + bookPath });
        let body = await response.text();
        body = body.replace(/data-editions="[^"]*"/, `data-editions="${JSON.stringify(editions).replaceAll('"', '&quot;')}"`)
          .replace(/(<select[^>]*data-reader="edition"[^>]*>)[\s\S]*?<\/select>/,
            `$1${editions.map(e => `<option value="${e.id}">${e.label}</option>`).join('')}</select>`);
        await route.fulfill({ response, body });
      });
      await page.route('https://api.literae.ch/assets/11111111-1111-4111-8111-*/**', async route => {
        const id = route.request().url().includes(a.id) ? 'a' : 'b';
        downloads.push(id);
        await route.fulfill({ body: await readFile(new URL(`../fixtures/reader-${id}.epub`, import.meta.url)), contentType: 'application/epub+zip', headers: { 'Access-Control-Allow-Origin': MAIN_ORIGIN } });
      });
      await openBook(page);
      expect(downloads).toEqual(['a']);
      await goToSection(page, 'Livre deuxième');
      const frame = await textFrame(page, 'Livre deuxième');
      await expect(frame.locator('p').first()).toContainText('Édition A');
      await expect.poll(() => savedCfi(a.id)).toMatch(/^epubcfi\(/);
      const beforeScroll = await savedCfi(a.id);
      await page.locator('[data-reader="viewport"]').hover({ position: { x: 100, y: 100 } });
      await page.mouse.wheel(0, 1200);
      await expect.poll(() => savedCfi(a.id)).not.toBe(beforeScroll);
      const aPosition = await savedCfi(a.id);
      await page.locator('[data-reader="edition"]').selectOption(b.id);
      await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute('aria-busy', 'false');
      await expect(page.locator('[data-reader="toc"]')).toHaveValue('preface.xhtml');
      const translated = await textFrame(page, 'Préface');
      await expect(translated.locator('p').first()).toContainText('Édition B');
      expect(await savedCfi(a.id)).toBe(aPosition);
      expect(downloads).toEqual(['a', 'b']);
      await goToSection(page, 'Livre premier');
      await textFrame(page, 'Livre premier');
      await expect.poll(() => savedCfi(b.id)).toMatch(/^epubcfi\(/);
      await expect(page.locator('[data-reader="toc"]')).toHaveValue('premier.xhtml');
      const bPosition = await savedCfi(b.id);
      await page.locator('[data-reader="edition"]').selectOption(a.id);
      await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute('aria-busy', 'false');
      await expect(page.locator('[data-reader="toc"]')).toHaveValue('deuxieme.xhtml');
      expect(await savedCfi(b.id)).toBe(bPosition);
      await page.locator('[data-reader="edition"]').selectOption(b.id);
      await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute('aria-busy', 'false');
      await expect(page.locator('[data-reader="toc"]')).toHaveValue('premier.xhtml');
      b.url = b.url.replace('meme-nom.epub?v=test', 'nom-modifie.epub?v=test2');
      await page.reload();
      await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute('aria-busy', 'false');
      await expect(page.locator('[data-reader="edition"]')).toHaveValue(b.id);
      await expect(page.locator('[data-reader="toc"]')).toHaveValue('premier.xhtml');
      await page.locator('[data-reader="edition"]').selectOption(a.id);
      await page.locator('[data-reader="edition"]').selectOption(b.id);
      await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute('aria-busy', 'false');
      await expect(page.locator('[data-reader="error"]')).toBeHidden();
      expect(errors).toEqual([]);
    });
  });
}
