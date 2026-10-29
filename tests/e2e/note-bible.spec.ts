import { test, expect, devices, type Page } from '@playwright/test';
import samples from '../fixtures/scripture-notes.json' with { type: 'json' };
import { chooseChapterHref } from './reader-helpers';

const MAIN = 'https://literae.ch', LOCAL = 'http://127.0.0.1:4322';
test.use({ baseURL: MAIN, ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {}) });
test.beforeEach(async ({ context }) => {
  await context.route(MAIN + '/**', async route => {
    const url = new URL(route.request().url());
    // Real comparator response, delayed to make the loading state observable.
    if (url.pathname === '/api/bible/verses') await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ response: await route.fetch({ url: LOCAL + url.pathname + url.search }) });
  });
});
test.afterEach(async ({ context }) => { await context.unrouteAll({ behavior: 'wait' }); });

async function openBook(page: Page, id: string) {
  const catalogue = await (await page.request.get(LOCAL + '/scriptorium/bibliotheque.json')).json();
  await page.goto(catalogue.items.find((b: { id: string }) => b.id === id).href);
  await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute('aria-busy', 'false');
}
async function openNote(page: Page, sample: { path: string; href: string }) {
  const href = await page.locator('[data-reader="toc-link"]').evaluateAll((links, path) =>
    links.map(a => (a as HTMLElement).dataset.href!).find(href => href.split('#')[0] === path), sample.path);
  expect(href).toBeTruthy();
  await chooseChapterHref(page, href!);
  await expect.poll(async () => {
    for (const frame of page.frames().slice(1)) try {
      const anchor = frame.locator(`a[href="${sample.href}"]`).first();
      if (await anchor.count()) { await anchor.click(); return true; }
    } catch {}
    return false;
  }, { timeout: 20000 }).toBe(true);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('[data-reader="note-body"]')).not.toContainText('Chargement de la note…');
}
async function settled(page: Page) {
  await expect(page.locator('.reader-bible-passage:not([hidden])').first()).toBeVisible();
  await expect(page.locator('.reader-bible-passage[aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('[data-reader="note-body"]')).not.toContainText('Ce passage n’est pas disponible');
}
for (const profile of [
  { name: '1920 × 1080', ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
  { name: 'mobile portrait', ...devices['Pixel 7'] },
  { name: 'mobile paysage', ...devices['Pixel 7 landscape'] },
]) test.describe('Références bibliques : ' + profile.name, () => {
  test.use({ viewport: profile.viewport, userAgent: profile.userAgent, isMobile: profile.isMobile, hasTouch: profile.hasTouch });
  for (const book of samples) test(book.title, async ({ page }, info) => {
    test.setTimeout(150000);
    const errors: string[] = [], requests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/bible/verses?')) requests.push(request.url()); });
    await openBook(page, book.bookId);
    // Several chapters on desktop; at least one real note per book on both mobile orientations.
    const examples = profile.isMobile ? book.examples.slice(0, 1) : book.examples;
    for (const [index, sample] of examples.entries()) {
      const countBefore = requests.length;
      await openNote(page, sample);
      const body = page.locator('[data-reader="note-body"]');
      const refs = body.locator('.reader-bible-reference');
      const mixed = book.title === 'Pensées' || book.title.includes('Glaire') || book.title.includes('Crampon');
      if (mixed) {
        expect(await refs.count()).toBeGreaterThan(0);
        await expect(body.locator('.reader-bible-passage:not([hidden])')).toHaveCount(0);
        expect(requests.length).toBe(countBefore);
        await expect(refs.first()).toHaveCSS('text-decoration-line', 'underline');
        await refs.first().click();
      } else {
        await expect(body.locator('.reader-bible-passages-only')).toHaveCount(1);
        await expect(refs).toHaveCount(0);
        expect(await body.evaluate(el => el.children.length)).toBe(1);
        await expect(body.locator('.reader-bible-passage').first()).toHaveCSS('border-top-width', '0px');
      }
      await settled(page);
      if (sample.text.includes('Heb., XI, 35')) {
        const passages = body.locator('.reader-bible-passage');
        await expect(passages).toHaveCount(2);
        await expect(passages.nth(1).locator('.reader-bible-location')).toHaveText('Chapitre 12, versets 1 à 2.');
        await expect(passages.nth(1)).toHaveCSS('border-top-width', '1px');
      }
      await expect(body.locator('.reader-bible-passage:not([hidden])').first()).toContainText(book.title.includes('Crampon') ? 'Bible Crampon' : book.title.includes('Glaire') ? 'Bible Glaire' : 'Bible Fillion');
      const panel = body.locator('.reader-bible-passage:not([hidden])').first();
      await expect(panel.locator('sup')).toHaveCount(0);
      const excerpt = panel.locator('p[data-verse]');
      expect(await excerpt.first().textContent()).toMatch(/^«\u00a0/);
      expect(await excerpt.last().textContent()).toMatch(/\u00a0»$/);
      if (book.title.includes('Imitation') && index === 0) {
        // Discontiguous verses must not include 18 or 19 between 17 and 20.
        expect(await panel.locator('p[data-verse]').evaluateAll(nodes => nodes.map(n => (n as HTMLElement).dataset.verse))).toEqual(['17', '20']);
      }
      if (index === 0) {
        const verses = await panel.locator('p[data-verse]').allTextContents();
        await panel.getByRole('button', { name: 'Lire le chapitre entier', exact: true }).click();
        await expect(panel.getByRole('status')).toHaveText('Chapitre en cours de chargement…');
        await settled(page);
        expect(await panel.locator('sup').count()).toBeGreaterThan(verses.length);
        expect(await panel.locator('p[data-verse]').first().textContent()).not.toMatch(/^«/);
        expect(await panel.locator('p[data-verse]').last().textContent()).not.toMatch(/»$/);
        expect(await panel.locator('.reader-bible-cited').count()).toBe(verses.length);
        await panel.getByRole('button', { name: 'Revenir au passage cité' }).click();
        await settled(page);
        await expect(panel.locator('sup')).toHaveCount(0);
        expect(await panel.locator('p[data-verse]').allTextContents()).toEqual(verses);
      }
      // The single scroll area must fit both the note and a full chapter on mobile.
      expect(await body.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      const bookmark = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('literae-epub-progress-v2:')));
      await page.getByRole('button', { name: 'Fermer la note' }).click();
      expect(await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('literae-epub-progress-v2:')))).toEqual(bookmark);
    }
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(url => new URL(url).searchParams.get('translation') === (book.title.includes('Crampon') ? 'CRA' : book.title.includes('Glaire') ? 'GLA' : 'FIL'))).toBe(true);
    expect(errors).toEqual([]);
    await info.attach('real-comparator-requests', { body: JSON.stringify(requests, null, 2), contentType: 'application/json' });
  });
  for (const theme of ['light', 'dark']) test('titres complets, sous-titres et retour à la sélection : ' + theme, async ({ page }, info) => {
    test.setTimeout(150000);
    if (profile.name === 'mobile portrait') await page.setViewportSize({ width: 320, height: 700 });
    await page.addInitScript(theme => localStorage.setItem('scriptorium-theme', theme), theme);
    const book = samples[0];
    await openBook(page, book.bookId);
    for (const sample of [
      { path: 'section-004.xhtml', href: 'literae-notes/section-004-3d69ccfc.xhtml#n-077b88c26b523d43f7e5c2b8-ef69fa6701a2',
        title: 'Évangile de saint Jean', location: 'Chapitre 8, verset 12.', chapter: 'Chapitre 8.' },
      { ...book.examples[1], title: 'Première épître de saint Paul aux Corinthiens', location: 'Chapitre 8, verset 1.', chapter: 'Chapitre 8.' },
      { ...book.examples[3], title: 'Épître aux Hébreux', location: 'Chapitre 11, versets 35 à 38.', chapter: 'Chapitre 11.' },
      { ...book.examples[0], title: 'Apocalypse de saint Jean', location: 'Chapitre 22, versets 17 et 20.', chapter: 'Chapitre 22.' },
    ]) {
      await openNote(page, sample);
      await settled(page);
      const body = page.locator('[data-reader="note-body"]');
      const panel = body.locator('.reader-bible-passage:not([hidden])').first();
      const heading = panel.getByRole('heading', { level: 3 });
      const coordinates = panel.locator('.reader-bible-location'), edition = panel.locator('.reader-bible-edition');
      await expect(heading).toHaveText(sample.title);
      await expect(coordinates).toHaveText(sample.location);
      await expect(edition).toHaveText('Bible Fillion');
      expect(await heading.locator('a, button').count()).toBe(0);
      const sizes = await Promise.all([heading, coordinates, edition].map(el => el.evaluate(el => parseFloat(getComputedStyle(el).fontSize))));
      expect(sizes[0]).toBeGreaterThan(sizes[1]); expect(sizes[1]).toBeGreaterThan(sizes[2]);
      for (const element of [heading, coordinates, edition]) {
        expect(await element.evaluate(el => {
          const body = el.closest('[data-reader="note-body"]')!, rect = el.getBoundingClientRect(), parent = body.getBoundingClientRect();
          return el.scrollWidth <= el.clientWidth + 1 && rect.left >= parent.left && rect.right <= parent.right;
        })).toBe(true);
      }
      if (sample.title.includes('Corinthiens')) {
        if (profile.name === 'mobile portrait') expect(await heading.evaluate(el => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))).toBeGreaterThan(1.5);
        const path = info.outputPath('titre-long-' + theme + '.png');
        await page.getByRole('dialog').screenshot({ path });
        await info.attach('titre-long-' + theme, { path, contentType: 'image/png' });
      }
      await panel.getByRole('button', { name: 'Lire le chapitre entier', exact: true }).click();
      await settled(page);
      await expect(heading).toHaveText(sample.title);
      await expect(coordinates).toHaveText(sample.chapter);
      await panel.getByRole('button', { name: 'Revenir au passage cité' }).click();
      await settled(page);
      await expect(heading).toHaveText(sample.title);
      await expect(coordinates).toHaveText(sample.location);
      await page.getByRole('button', { name: 'Fermer la note' }).click();
    }
  });
  test('la référence aligne le premier verset cité dans le chapitre entier', async ({ page }) => {
    test.setTimeout(90000);
    const book = samples[0], requests: string[] = [];
    page.on('request', request => { if (request.url().includes('/api/bible/verses?')) requests.push(request.url()); });
    await openBook(page, book.bookId);
    // Single verse, contiguous range and discontiguous list, including citations
    // near the end where normal scroll limits would prevent top alignment.
    for (const sample of [book.examples[2], book.examples[3], book.examples[0], book.examples[4]]) {
      await openNote(page, sample);
      await settled(page);
      const body = page.locator('[data-reader="note-body"]');
      const panel = body.locator('.reader-bible-passage:not([hidden])').first();
      const citedVerse = (await panel.locator('p[data-verse]').first().getAttribute('data-verse'))!;
      await panel.getByRole('button', { name: 'Lire le chapitre entier', exact: true }).click();
      await settled(page);
      expect(await body.evaluate(el => el.scrollTop)).toBe(0);
      const count = await panel.locator('sup').count(), beforeRequests = requests.length;
      const background = () => page.evaluate(() => ({
        page: window.scrollY,
        book: document.querySelector('.epub-container')!.scrollTop,
        bookmarks: Object.entries(localStorage).filter(([k]) => k.startsWith('literae-epub-progress-v2:')),
      }));
      const before = await background();
      await panel.getByRole('button', { name: 'Aller au passage cité', exact: true }).click();
      const cited = panel.locator('.reader-bible-cited').first();
      await expect(cited.locator('sup')).toHaveText(citedVerse);
      await expect.poll(() => cited.evaluate(el => {
        const body = el.closest<HTMLElement>('[data-reader="note-body"]')!;
        return Math.abs(el.getBoundingClientRect().top - body.getBoundingClientRect().top - parseFloat(getComputedStyle(body).paddingTop));
      })).toBeLessThanOrEqual(1);
      expect(await panel.locator('sup').count()).toBe(count);
      expect(requests.length).toBe(beforeRequests);
      expect(await background()).toEqual(before);
      await page.getByRole('button', { name: 'Fermer la note' }).click();
    }
  });
});

test('échec réseau, réessai, cache et fermeture pendant le chargement', async ({ page, context }) => {
  const imitation = samples[0], sample = imitation.examples[1];
  await openBook(page, imitation.bookId);
  let fail = true, calls = 0;
  await context.route(MAIN + '/api/bible/verses?**', async route => {
    calls++;
    if (fail) return route.abort('failed');
    await new Promise(resolve => setTimeout(resolve, 600));
    const url = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: LOCAL + url.pathname + url.search }) });
  });
  await openNote(page, sample);
  await expect(page.getByRole('button', { name: 'Réessayer', exact: true })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(page.locator('.reader-bible-status')).toHaveText('Verset en cours de chargement…');
  await settled(page);
  const loadedCalls = calls;
  await page.getByRole('button', { name: 'Fermer la note' }).click();
  await openNote(page, sample);
  await settled(page);
  expect(calls).toBe(loadedCalls);
  await page.getByRole('button', { name: 'Lire le chapitre entier' }).click();
  await page.getByRole('button', { name: 'Fermer la note' }).click();
  await openNote(page, sample);
  await settled(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.reader-bible-passage h3')).toHaveText('Première épître de saint Paul aux Corinthiens');
  await expect(page.locator('.reader-bible-location')).toHaveText('Chapitre 8, verset 1.');
});
