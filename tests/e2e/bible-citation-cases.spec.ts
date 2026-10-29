import { test, expect, devices, type Page, type Frame } from '@playwright/test';
import cases from '../fixtures/bible-citation-cases.json' with { type: 'json' };
import { chooseChapterHref } from './reader-helpers';
const MAIN = 'https://literae.ch', LOCAL = 'http://127.0.0.1:4322';
test.use({ baseURL: MAIN, ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {}) });
test.beforeEach(async ({ context }) => {
  await context.route(MAIN + '/**', async route => {
    const u = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: LOCAL + u.pathname + u.search }) });
  });
});
test.afterEach(async ({ context }) => { await context.unrouteAll({ behavior: 'wait' }); });
async function openBook(page: Page, id: string) {
  const { items } = await (await page.request.get(LOCAL + '/scriptorium/bibliotheque.json')).json();
  await page.goto(items.find((b: { id: string }) => b.id === id).href);
  await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
}
async function chapter(page: Page, path: string): Promise<Frame> {
  const href = await page.locator('[data-reader="toc-link"]').evaluateAll((a, path) => a.map(a => (a as HTMLElement).dataset.href!).find(h => h.split('#')[0] === path), path);
  expect(href).toBeTruthy(); await chooseChapterHref(page, href!);
  let found: Frame | undefined;
  await expect.poll(async () => {
    for (const frame of page.frames().slice(1)) try {
      if (await frame.locator(`html[data-reader-source$="/${path}"]`).count()) { found = frame; return true; }
    } catch {}
    return false;
  }).toBe(true);
  return found!;
}
async function loaded(page: Page) {
  const panel = page.locator('.reader-bible-passage:not([hidden])').first();
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(panel).not.toContainText('Ce passage n’est pas disponible');
  return panel;
}
for (const profile of [
  { name: 'ordinateur', ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
  { name: 'mobile portrait', ...devices['Pixel 7'] },
  { name: 'mobile paysage', ...devices['Pixel 7 landscape'] },
]) test.describe('Cas signalés : ' + profile.name, () => {
  test.use({ viewport: profile.viewport, isMobile: profile.isMobile, hasTouch: profile.hasTouch, userAgent: profile.userAgent });
  for (const book of cases) test(book.title, async ({ page }) => {
    test.setTimeout(180000);
    const requests: string[] = [], errors: string[] = [];
    page.on('request', r => { if (r.url().includes('/api/bible/verses?')) requests.push(r.url()); });
    page.on('pageerror', e => errors.push(e.message));
    await openBook(page, book.bookId);
    for (const sample of book.examples || []) {
      const frame = await chapter(page, sample.path);
      await frame.locator(`a[href="${sample.href}"]`).first().click();
      const body = page.locator('[data-reader="note-body"]');
      await expect(page.getByRole('dialog', { name: /^Note / })).toBeVisible();
      await expect(body).not.toContainText('Chargement de la note');
      if (sample.text.includes('Avec ses disciples')) {
        await expect(body).toContainText('Avec ses disciples');
        expect((await body.textContent())!.trim()).not.toMatch(/^II\. 2\./);
      } else {
        const refs = body.locator('.reader-bible-reference');
        const automatic = await body.locator('.reader-bible-passages-only').count() > 0;
        if (automatic) {
          await expect(body.locator('.reader-bible-passages-only')).toBeVisible();
          await expect(refs).toHaveCount(0);
        } else await expect(refs.first()).toBeVisible();
        if (book.title.includes('Crampon')) {
          expect((await body.textContent())!.trim()).not.toMatch(/^(?:I[,\.]\s*1\.|51\.|22\.|14-15\.)/);
        }
        if (book.title.includes('Glaire')) {
          await expect(body).not.toContainText('Jn 2:19');
          expect((await body.textContent())!.trim()).toMatch(/^Voir/);
        }
        if (!automatic) await refs.first().click();
        const panel = await loaded(page);
        await expect(panel).toContainText(book.title.includes('Crampon') ? 'Bible Crampon' : book.title.includes('Glaire') ? 'Bible Glaire' : 'Bible Fillion');
        if (sample.text.includes('L’abîme')) {
          await expect(panel).toContainText('l’abîme comme d’un vêtement');
          expect(requests.some(u => u.includes('chapter=103') && u.includes('verse=6') && u.includes('translation=CRA'))).toBe(true);
        }
        if (sample.text.includes('À l’Écriture')) {
          await expect(panel).toContainText('ne livreras pas mon âme');
          expect(requests.some(u => u.includes('chapter=15') && u.includes('verse=10'))).toBe(true);
          // The same note also contains chapter-only references.
          await refs.filter({ hasText: /^Ps\. 21/ }).click();
          await expect(body.locator('.reader-bible-passage:not([hidden])')).toHaveCount(2);
          await expect(body.locator('.reader-bible-passage[aria-busy="true"]')).toHaveCount(0);
          expect(requests.some(u => new URL(u).searchParams.get('chapter') === '21' && !new URL(u).searchParams.has('verse'))).toBe(true);
        }
        expect(await body.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      }
      await page.getByRole('button', { name: 'Fermer la note' }).click();
    }
    if (book.inline) {
      const frame = await chapter(page, book.inline.path);
      const label = book.title === 'Confessions' ? 'Pr 6:26' : book.title === 'Oraisons funèbres' ? 'Ps. 2:10' : 'Lc 1:4';
      const link = frame.locator(`.reader-inline-bible[data-reference="${label}"]`).first();
      await expect(link).toBeVisible();
      // Keep a real CFI from an unadorned DOM and check its resolution against
      // the decorated DOM. No anchor wrappers may change source node indices.
      await page.addScriptTag({ path: 'node_modules/epubjs/dist/epub.js' });
      const cfiCheck = await frame.evaluate(() => {
        const CFI = (parent as any).ePub.CFI;
        const clone = document.cloneNode(true) as Document;
        clone.querySelector('[data-reader-bible-layer]')?.remove();
        const get = (doc: Document) => {
          const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
          const nodes: Text[] = []; while (walker.nextNode()) if (walker.currentNode.textContent!.trim().length > 30) nodes.push(walker.currentNode as Text);
          return nodes[Math.floor(nodes.length / 2)];
        };
        const original = clone.createRange(); original.setStart(get(clone), 7); original.collapse(true);
        const old = new CFI(original, '/6/12').toString();
        const restored = new CFI(old).toRange(document);
        return { old, actual: new CFI(restored, '/6/12').toString(), text: restored.startContainer.textContent?.slice(7, 30), expected: original.startContainer.textContent?.slice(7, 30) };
      });
      expect(cfiCheck.actual).toBe(cfiCheck.old); expect(cfiCheck.text).toBe(cfiCheck.expected);
      if (book.title === 'Confessions') expect(await frame.locator('body').textContent()).not.toContain('(410)');
      await link.click();
      await loaded(page);
      await expect(page.locator('[data-reader="note-title"]')).toHaveText(label);
      await page.getByRole('button', { name: 'Lire le chapitre entier' }).click();
      await loaded(page);
      await page.getByRole('button', { name: 'Fermer la note' }).click();
      // The overlays must follow typography reflow, without replacing source text.
      await page.locator('.reader-settings summary').click();
      await page.locator('[data-reader="size"]').fill('26');
      await page.locator('[data-reader="size"]').dispatchEvent('input');
      await page.locator('.reader-settings summary').click();
      if (book.title === 'Confessions') await expect.poll(() => frame.evaluate(term => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node: Text | null = null;
        while (walker.nextNode()) if (walker.currentNode.textContent!.includes(term)) { node = walker.currentNode as Text; break; }
        if (!node) return Infinity;
        const start = node.data.indexOf(term), range = document.createRange();
        range.setStart(node, start); range.setEnd(node, start + term.length);
        const text = range.getBoundingClientRect();
        const link = document.querySelector('.reader-inline-bible[data-reference="Pr 6:26"]')!.getBoundingClientRect();
        return Math.max(Math.abs(link.left - text.left), Math.abs(link.top - text.top));
      }, book.inline!.text)).toBeLessThanOrEqual(1);
      await link.click(); await loaded(page);
      await page.getByRole('button', { name: 'Fermer la note' }).click();
    }
    expect(errors).toEqual([]);
  });
});

test('une Bible absente du comparateur utilise Fillion comme traduction de secours', async ({ page, context }) => {
  await context.route(MAIN + '/api/bible/verses?**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('translation') === 'CRA') return route.fulfill({ json: { results: [] } });
    return route.fallback();
  });
  const book = cases[1], sample = book.examples![1];
  await openBook(page, book.bookId);
  const frame = await chapter(page, sample.path);
  await frame.locator(`a[href="${sample.href}"]`).first().click();
  await page.locator('.reader-bible-reference').first().click();
  const panel = await loaded(page);
  await expect(panel).toContainText('Bible Fillion (traduction de secours)');
  await expect(panel).toContainText('Au commencement');
});

test('fermer une note Crampon annule aussi son éventuel repli vers Fillion', async ({ page, context }) => {
  let release!: () => void, started!: () => void;
  const held = new Promise<void>(resolve => release = resolve);
  const requested = new Promise<void>(resolve => started = resolve);
  const calls: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/bible/verses?')) calls.push(request.url()); });
  await context.route(MAIN + '/api/bible/verses?**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('translation') === 'CRA' && url.searchParams.get('book') === 'GEN') {
      started(); await held; await route.abort('failed').catch(() => {}); return;
    }
    return route.fallback();
  });
  try {
    const book = cases[1], sample = book.examples![1];
    await openBook(page, book.bookId);
    const frame = await chapter(page, sample.path);
    await frame.locator(`a[href="${sample.href}"]`).first().click();
    await page.locator('.reader-bible-reference').first().click();
    await requested;
    const cancelled = page.waitForEvent('requestfailed', request => request.url().includes('translation=CRA'));
    await page.getByRole('button', { name: 'Fermer la note' }).click();
    await cancelled; release();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(calls.some(url => url.includes('translation=FIL'))).toBe(false);
    await expect(page.locator('[data-reader="note-dialog"]')).toBeHidden();
  } finally { release(); }
});
