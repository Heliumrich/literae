import { test, expect, devices, type Page } from '@playwright/test';
import reported from '../fixtures/bible-citation-cases.json' with { type: 'json' };
import samples from '../fixtures/scripture-notes.json' with { type: 'json' };
import { chooseChapterHref } from './reader-helpers';
const MAIN = 'https://literae.ch', LOCAL = 'http://127.0.0.1:4322';
test.use({ ...devices['Desktop Chrome'], baseURL: MAIN, ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {}) });
test.beforeEach(async ({ context }) => {
  await context.route(MAIN + '/**', async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: LOCAL + url.pathname + url.search }) });
  });
});
test.afterEach(async ({ context }) => { await context.unrouteAll({ behavior: 'wait' }); });
async function prepare(page: Page, book: typeof samples[number]) {
  const { items } = await (await page.request.get(LOCAL + '/scriptorium/bibliotheque.json')).json();
  await page.goto(items.find((b: {id: string}) => b.id === book.bookId).href);
  await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
  const sample = book.examples[0];
  const href = await page.locator('[data-reader="toc-link"]').evaluateAll((links, path) =>
    links.map(link => (link as HTMLElement).dataset.href!).find(href => href.split('#')[0] === path), sample.path);
  await chooseChapterHref(page, href!);
  for (let attempt = 0; attempt < 20; attempt++) {
    for (const frame of page.frames().slice(1)) {
      const link = frame.locator(`a[href="${sample.href}"]`).first();
      if (await link.count()) { await frame.evaluate(() => document.fonts.ready); await link.scrollIntoViewIfNeeded(); await page.waitForTimeout(500); return link; }
    }
    await page.waitForTimeout(100);
  }
  throw new Error('Note absente');
}
for (const theme of ['light','dark']) test('aperçu souris, passage vers le panneau, clic : ' + theme, async ({ page }, info) => {
  await page.addInitScript(theme => localStorage.setItem('scriptorium-theme', theme), theme);
  const link = await prepare(page, samples[0]);
  const bookmarks = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('literae-epub-progress-v2:')));
  const before = await bookmarks();
  await link.hover();
  const preview = page.getByRole('region', { name: 'Aperçu de la note' });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Apocalypse de saint Jean');
  await expect(preview.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(preview).toContainText('Bible Fillion');
  await expect(preview.getByRole('button', { name: /chapitre entier|Fermer/ })).toHaveCount(0);
  await preview.hover();
  await page.waitForTimeout(400);
  await expect(preview).toBeVisible();
  expect(await preview.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })).toBe(true);
  const screenshot = info.outputPath('aperçu-' + theme + '.png');
  await page.screenshot({ path: screenshot });
  await info.attach('aperçu-' + theme, { path: screenshot, contentType: 'image/png' });
  await page.mouse.move(1, 1);
  await expect(preview).toBeHidden();
  expect(await bookmarks()).toEqual(before);
  await link.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lire le chapitre entier' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Bible Fillion');
  await page.getByRole('button', { name: 'Fermer la note' }).click();
});
test('commentaire long défilable, sans requête biblique avant une référence', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  const requests: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/bible/verses?')) requests.push(r.url()); });
  const book = samples.find(b => b.title.includes('Crampon'))!;
  const link = await prepare(page, { ...book, examples: [{ ...book.examples[0], ...reported[1].examples![1] }] });
  await link.hover();
  const preview = page.getByRole('region', { name: 'Aperçu de la note' });
  await expect(preview).toContainText('Les versets 1-18');
  expect(requests).toEqual([]);
  await preview.hover();
  await preview.locator('.reader-bible-reference').first().click();
  await expect(preview).toContainText('Bible Crampon');
  await preview.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(300);
  await expect(preview).toBeVisible();
  expect(await preview.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
});
test.describe('mobile : clic seul', () => {
  test.use({ viewport: devices['Pixel 7'].viewport, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent });
  test('aucun aperçu au passage du pointeur ou au toucher', async ({ page }) => {
    const link = await prepare(page, samples[0]);
    await link.hover(); await page.waitForTimeout(400);
    await expect(page.getByRole('region', { name: 'Aperçu de la note' })).toBeHidden();
    await link.tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('Bible Fillion');
    await page.getByRole('button', { name: 'Fermer la note' }).click();
  });
});
test('citation dans le texte et aperçu en plein écran', async ({ page }) => {
  const { items } = await (await page.request.get(LOCAL + '/scriptorium/bibliotheque.json')).json();
  await page.goto(items.find((b: {id: string}) => b.id === 'a758f0c9-c999-4d8a-ae1d-42f8a7c66c92').href);
  await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute('aria-busy', 'false', {timeout:30000});
  const href = await page.locator('[data-reader="toc-link"]').evaluateAll(links => links.map(a => (a as HTMLElement).dataset.href!).find(h => h.split('#')[0] === 'section-006.xhtml'));
  await chooseChapterHref(page, href!);
  await page.locator('[data-reader="fullscreen"]').click();
  await expect(page.locator('.epub-reader')).toHaveJSProperty('offsetWidth', await page.evaluate(() => innerWidth));
  let link;
  await expect.poll(async () => {
    for (const f of page.frames().slice(1)) {
      try {
        const candidate = f.locator('.reader-inline-bible[data-reference="Pr 6:26"]').first();
        if (await candidate.count()) { link = candidate; return true; }
      } catch { /* Continuous views can be replaced while fullscreen settles. */ }
    }
    return false;
  }, { timeout: 20000 }).toBe(true);
  await link!.scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await link!.hover();
  const preview = page.getByRole('region', {name:'Aperçu de la note'});
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Livre des Proverbes');
  await expect(preview).toContainText('Bible Fillion');
  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();
});
