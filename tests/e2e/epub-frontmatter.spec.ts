import { test, expect, devices } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import batch from '../fixtures/frontmatter-catalog.json' with { type: 'json' };
import { chooseChapterHref } from './reader-helpers';

const MAIN = 'https://literae.ch', LOCAL = 'http://127.0.0.1:4322';
test.describe.configure({ mode: 'parallel' });
test.use({ baseURL: MAIN, ...(process.env.HTTPS_PROXY ? {
  proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' },
} : {}) });

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } };
for (const [name, profile, kind] of [
  ['web desktop', desktop, 'web'],
  ['web portrait', devices['Pixel 7'], 'web'],
  ['web paysage', devices['Pixel 7 landscape'], 'web'],
  ['liseuse', desktop, 'download'],
] as const) {
  test.describe(name, () => {
    test.use({ viewport: profile.viewport, userAgent: profile.userAgent,
      isMobile: profile.isMobile, hasTouch: profile.hasTouch, deviceScaleFactor: profile.deviceScaleFactor });
    for (const book of batch) test(book.title, async ({ page, context, request }, info) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await context.route(MAIN + '/**', async route => {
        const url = new URL(route.request().url());
        await route.fulfill({ response: await route.fetch({ url: LOCAL + url.pathname + url.search }) });
      });
      // Test both real editions in the same application, without changing its catalogue.
      await context.route('https://api.literae.ch/assets/**', async route => {
        if (new URL(route.request().url()).pathname.split('/')[2] !== book.webId) return route.continue();
        const id = kind === 'web' ? book.webId : book.downloadId;
        if (process.env.LITERAE_PREPARED_EPUB_DIR) {
          await route.fulfill({ body: await readFile(`${process.env.LITERAE_PREPARED_EPUB_DIR}/${id}.epub`), contentType: 'application/epub+zip', headers: { 'access-control-allow-origin': '*' } });
        } else {
          const asset = new URL(route.request().url());
          asset.pathname = `/assets/${id}`;
          await route.fulfill({ response: await route.fetch({ url: asset.href }) });
        }
      });
      const catalogue = (await (await request.get(LOCAL + '/scriptorium/bibliotheque.json')).json()).items;
      const item = catalogue.find((item: { id: string }) => item.id === book.bookId);
      expect(item).toBeTruthy();
      await page.goto(item.href);
      const viewport = page.locator('[data-reader="viewport"]');
      await expect(viewport).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
      await expect(page.locator('[data-reader="error"]')).toBeHidden();
      await expect.poll(() => viewport.evaluate(viewport => {
        for (const iframe of viewport.querySelectorAll('iframe')) {
          const doc = iframe.contentDocument, img = doc?.querySelector<HTMLImageElement>('.literae-cover img');
          if (!img || !img.complete || !img.naturalWidth) continue;
          const style = iframe.contentWindow!.getComputedStyle(img), rect = img.getBoundingClientRect();
          return { decoded: img.naturalWidth === 1200 && img.naturalHeight === 1680,
            height: doc!.body.getBoundingClientRect().height === viewport.clientHeight,
            fits: rect.width <= iframe.clientWidth + 1 && rect.height <= viewport.clientHeight + 1,
            fit: style.objectFit, svg: !!doc!.querySelector('svg') };
        }
        return null;
      })).toEqual({ decoded: true, height: true, fits: true, fit: 'contain', svg: false });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      if (['Les Dernières Colonnes de l’Église', 'Somme Théologique', 'Confessions'].includes(book.title))
        await viewport.screenshot({ path: info.outputPath('cover.png') });
      if (book.title.includes('Sacy')) {
        const links = page.locator('[data-reader="toc-link"]');
        const oldEditions = await links.evaluateAll(elements => elements.some(element => /p(?:019|029|070)-/.test((element as HTMLElement).dataset.href || '')));
        expect(oldEditions).toBe(false);
        for (const [label, chapters, last] of [['Esther', 16, 'p075-015.xhtml'], ['Daniel', 14, 'p072-013.xhtml']] as const) {
          const bookLink = links.filter({ hasText: new RegExp(`^${label}$`) });
          await expect(bookLink).toHaveCount(1);
          expect(await bookLink.evaluate(element => element.closest('li')!.querySelectorAll(':scope > ul > li').length)).toBe(chapters);
          await chooseChapterHref(page, last);
          await expect.poll(() => viewport.evaluate((viewport, path) => {
            for (const iframe of viewport.querySelectorAll('iframe')) {
              const doc = iframe.contentDocument;
              if (doc?.documentElement.dataset.readerSource?.endsWith('/' + path))
                return doc.querySelectorAll('p.verse').length;
            }
            return 0;
          }, last)).toBeGreaterThan(0);
        }
      }
      expect(errors).toEqual([]);
      await context.unrouteAll({ behavior: 'wait' });
    });
  });
}
