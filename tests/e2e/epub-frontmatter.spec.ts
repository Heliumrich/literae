import { test, expect, devices } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import batch from '../fixtures/frontmatter-catalog.json' with { type: 'json' };
import { chooseChapterHref } from './reader-helpers';

const MAIN = 'https://literae.ch', LOCAL = 'http://127.0.0.1:4322';
const LIVE = process.env.LITERAE_LIVE === '1';
// Preview newly published immutable assets against the deployed reader before its next build.
const publicEpubMap: Record<string, string> = process.env.LITERAE_PUBLIC_EPUB_MAP
  ? JSON.parse(await readFile(process.env.LITERAE_PUBLIC_EPUB_MAP, 'utf8')) : {};
const webIds = (id: string) => [id, publicEpubMap[id], ...Object.keys(publicEpubMap).filter(old => publicEpubMap[old] === id)];
test.describe.configure({ mode: 'parallel' });
test.use({ baseURL: MAIN, ignoreHTTPSErrors: !!process.env.HTTPS_PROXY, ...(process.env.HTTPS_PROXY ? {
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
      const diagnostics: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') diagnostics.push(message.text()); });
      page.on('requestfailed', request => diagnostics.push(`${request.url()}: ${request.failure()?.errorText}`));
      if (!LIVE) await context.route(MAIN + '/**', async route => {
        const url = new URL(route.request().url());
        await route.fulfill({ response: await route.fetch({ url: LOCAL + url.pathname + url.search }) });
      });
      // Test both real editions in the same application, without changing its catalogue.
      await context.route('https://api.literae.ch/assets/**', async route => {
        if (!webIds(book.webId).includes(new URL(route.request().url()).pathname.split('/')[2])) return route.continue();
        const id = kind === 'web' ? publicEpubMap[book.webId] || book.webId : book.downloadId;
        if (process.env.LITERAE_PREPARED_EPUB_DIR) {
          await route.fulfill({ body: await readFile(`${process.env.LITERAE_PREPARED_EPUB_DIR}/${id}.epub`), contentType: 'application/epub+zip', headers: { 'access-control-allow-origin': '*' } });
        } else {
          const asset = new URL(route.request().url());
          asset.pathname = `/assets/${id}`;
          const response = await route.fetch({ url: asset.href });
          const body = await response.body();
          diagnostics.push(`${asset.href}: HTTP ${response.status()}, ${body.length}/${response.headers()['content-length']} bytes, SHA-256 ${createHash('sha256').update(body).digest('hex')}`);
          await route.fulfill({ response });
        }
      });
      const catalogue = (await (await request.get((LIVE ? MAIN : LOCAL) + '/scriptorium/bibliotheque.json')).json()).items;
      const item = catalogue.find((item: { id: string }) => item.id === book.bookId);
      expect(item).toBeTruthy();
      await page.goto(item.href);
      if (LIVE) expect(JSON.parse(await page.locator('[data-editions]').getAttribute('data-editions') || '[]').some((edition: {id: string}) => webIds(book.webId).includes(edition.id))).toBe(true);
      const viewport = page.locator('[data-reader="viewport"]');
      await expect(viewport).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
      await expect(page.locator('[data-reader="error"]'), diagnostics.join('\n')).toBeHidden();
      await expect.poll(() => viewport.evaluate((viewport, kind) => {
        for (const iframe of viewport.querySelectorAll('iframe')) {
          const doc = iframe.contentDocument;
          const graphic = doc?.querySelector<SVGSVGElement | HTMLImageElement>('.literae-cover svg, .literae-cover img');
          if (!graphic) continue;
          const rect = graphic.getBoundingClientRect();
          const frame = iframe.getBoundingClientRect(), outer = viewport.getBoundingClientRect();
          const img = graphic.tagName.toLowerCase() === 'img' ? graphic as HTMLImageElement : null;
          const svg = graphic.tagName.toLowerCase() === 'svg';
          return { visible: rect.width > 100 && rect.height >= viewport.clientHeight * .95,
            height: Math.abs(doc!.body.getBoundingClientRect().height - viewport.clientHeight) <= 1,
            fits: rect.width <= iframe.clientWidth + 1 && rect.height <= viewport.clientHeight + 1,
            atStart: Math.abs(frame.top - outer.top) <= 1,
            artwork: svg ? !!graphic.querySelector('text') && !!graphic.querySelector('rect')
              : !!img?.complete && img.naturalWidth === 1200 && img.naturalHeight === 1680,
            format: kind === 'web' ? svg : !svg,
            textFits: !svg || [...graphic.querySelectorAll('text')].every(text => {
              const box = text.getBBox();
              return box.width > 0 && box.x >= 72 && box.x + box.width <= 1128 && box.y >= 72 && box.y + box.height <= 1608;
            }) };
        }
        return null;
      }, kind), { timeout: 15000 }).toEqual({ visible: true, height: true, fits: true, atStart: true, artwork: true, format: true, textFits: true });
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
