import { test, expect, devices } from '@playwright/test';
import books from '../fixtures/frontmatter-catalog.json' with { type: 'json' };

const MAIN = 'https://literae.ch', LOCAL = 'http://127.0.0.1:4322';
const LIVE = process.env.LITERAE_LIVE === '1';
test.use({ baseURL: MAIN, ignoreHTTPSErrors: !!process.env.HTTPS_PROXY,
  ...(process.env.HTTPS_PROXY ? { proxy: {server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost'} } : {}) });
test.beforeEach(async ({context}) => {
  if (!LIVE) await context.route(MAIN + '/**', async route => {
    const url = new URL(route.request().url());
    await route.fulfill({response: await route.fetch({url: LOCAL + url.pathname + url.search})});
  });
});
for (const [profile, options] of [
  ['portrait', devices['Pixel 7']],
  ['paysage', devices['Pixel 7 landscape']],
] as const) test.describe(profile, () => {
  test.use({viewport: options.viewport, isMobile: true, hasTouch: true, userAgent: options.userAgent, deviceScaleFactor: options.deviceScaleFactor});
  for (const title of ['L’Imitation de Jésus-Christ', 'Confessions', 'Sainte Bible traduite par A. Crampon'])
    test(`Défiler depuis la couverture : ${title}`, async ({page, context, request}) => {
      // Playwright creates an empty storage context: opening must not rely on a saved position.
      const book = books.find(book => book.title === title)!;
      const catalogue = (await (await request.get((LIVE ? MAIN : LOCAL) + '/scriptorium/bibliotheque.json')).json()).items;
      await page.goto(catalogue.find((item: {id: string}) => item.id === book.bookId).href);
      const viewport = page.locator('[data-reader="viewport"]');
      await expect(viewport).toHaveAttribute('aria-busy', 'false', {timeout: 30000});
      await expect(page.locator('[data-reader="error"]')).toBeHidden();
      const scroller = page.locator('.epub-container');
      await expect.poll(() => scroller.evaluate(el => el.scrollHeight > el.clientHeight + 1)).toBe(true);
      expect(await scroller.evaluate(el => el.scrollTop)).toBe(0);
      await viewport.evaluate(el => {
        const header = document.querySelector('.site-header')!.getBoundingClientRect().height;
        window.scrollTo(0, el.getBoundingClientRect().top + scrollY - header - 8);
      });
      const cdp = await context.newCDPSession(page);
      async function swipe() {
        const box = await viewport.boundingBox();
        const height = await page.evaluate(() => innerHeight);
        const x = box!.x + box!.width / 2;
        const bottom = Math.min(box!.y + box!.height - 20, height - 20);
        const top = Math.max(box!.y + 20, bottom - 300);
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y: bottom}]});
        for (let step = 1; step <= 12; step++) {
          await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: bottom - (bottom - top) * step / 12}]});
          await page.waitForTimeout(20);
        }
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      }
      await swipe();
      await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(30);
      // Continue past the full-height cover without touching Next or the table of contents.
      for (let step = 0; step < 5; step++) await swipe();
      await expect.poll(() => scroller.evaluate(el => {
        const top = el.getBoundingClientRect().top;
        return [...el.querySelectorAll('iframe')].some(frame =>
          frame.closest('.epub-view')?.getAttribute('ref') !== '0'
          && frame.getBoundingClientRect().top < top + el.clientHeight
          && frame.getBoundingClientRect().bottom > top
          && !!frame.contentDocument?.body.textContent?.trim());
      })).toBe(true);
      // Reaching the bottom must also add the following XHTML, as it does after a Next click.
      const last = () => scroller.evaluate(el => Math.max(...[...el.children].map(view => Number(view.getAttribute('ref')))));
      const before = await last();
      await scroller.evaluate(el => {el.scrollTop = el.scrollHeight;});
      await expect.poll(last).toBeGreaterThan(before);
      // A new view is appended before its content hooks finish rendering.
      await expect.poll(() => scroller.evaluate(el =>
        el.lastElementChild?.querySelector('iframe')?.title.startsWith('Texte de '))).toBe(true);
      await expect(page.locator('[data-reader="error"]')).toBeHidden();
      await cdp.detach();
      await context.unrouteAll({behavior: 'wait'});
    });
});


