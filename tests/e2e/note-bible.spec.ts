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
      expect(await refs.count()).toBeGreaterThan(0);
      const mixed = book.title === 'Pensées' || book.title.includes('Glaire') || book.title.includes('Crampon');
      if (mixed) {
        await expect(body.locator('.reader-bible-passage:not([hidden])')).toHaveCount(0);
        expect(requests.length).toBe(countBefore);
        await expect(refs.first()).toHaveCSS('text-decoration-line', 'underline');
        await refs.first().click();
      }
      await settled(page);
      await expect(body.locator('.reader-bible-passage:not([hidden])').first()).toContainText(book.title.includes('Crampon') ? 'Bible Crampon' : book.title.includes('Glaire') ? 'Bible Glaire' : 'Bible Fillion');
      const panel = body.locator('.reader-bible-passage:not([hidden])').first();
      expect(await panel.locator('sup').count()).toBeGreaterThan(0);
      if (book.title.includes('Imitation') && index === 0) {
        // Discontiguous verses must not include 18 or 19 between 17 and 20.
        expect(await panel.locator('sup').allTextContents()).toEqual(['17', '20']);
      }
      if (index === 0) {
        const verses = await panel.locator('sup').allTextContents();
        await panel.getByRole('button', { name: 'Lire le chapitre entier', exact: true }).click();
        await expect(panel.getByRole('status')).toHaveText('Chapitre en cours de chargement…');
        await settled(page);
        expect(await panel.locator('sup').count()).toBeGreaterThan(verses.length);
        expect(await panel.locator('.reader-bible-cited').count()).toBe(verses.length);
        await panel.getByRole('button', { name: 'Revenir au passage cité' }).click();
        await settled(page);
        expect(await panel.locator('sup').allTextContents()).toEqual(verses);
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
      const citedVerse = (await panel.locator('sup').first().textContent())!;
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
      await body.locator('.reader-bible-reference').first().click();
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
  await expect(page.locator('.reader-bible-passage h3')).toHaveText('1 Cor. 8:1');
});
