import { test, expect, devices } from '@playwright/test';
import batch from '../../scripts/catalogs/patristic-2026-10.json' with { type: 'json' };

const ORIGIN = 'https://literae.ch';
const LOCAL = 'http://127.0.0.1:4322';
let catalogue: { title: string; href: string }[];

test.use({
  baseURL: ORIGIN,
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {}),
});
test.beforeAll(async ({ request }) => {
  const response = await request.get(`${LOCAL}/scriptorium/bibliotheque.json`);
  catalogue = (await response.json()).items;
});
test.beforeEach(async ({ context }) => {
  await context.route(`${ORIGIN}/**`, async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: LOCAL + url.pathname + url.search });
    await route.fulfill({ response });
  });
});

for (const device of ['Desktop Chrome', 'Pixel 7']) {
  test.describe(`Éditions patristiques : ${device}`, () => {
    const profile = devices[device];
    test.use({ viewport: profile.viewport, userAgent: profile.userAgent, isMobile: profile.isMobile, hasTouch: profile.hasTouch, deviceScaleFactor: profile.deviceScaleFactor });
    for (const row of batch) {
      test(row.author + ' — ' + row.title, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        const item = catalogue.find(item => item.title === row.title);
        expect(item, 'Ouvrage importé au catalogue').toBeTruthy();
        await page.goto(item!.href);
        await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute('aria-busy', 'false');
        await expect(page.locator('[data-reader="error"]')).toBeHidden();
        const dimensions = await page.evaluate(() => {
          const viewport = document.querySelector<HTMLElement>('[data-reader="viewport"]')!;
          for (const iframe of viewport.querySelectorAll('iframe')) {
            const doc = iframe.contentDocument;
            if (!doc?.querySelector('.literae-cover')) continue;
            const cover = doc.body.getBoundingClientRect();
            const svg = doc.querySelector('svg')!.getBoundingClientRect();
            const overflow = [...doc.querySelectorAll('svg text')].some(text => {
              const rect = text.getBoundingClientRect();
              return rect.left < svg.left - 1 || rect.right > svg.right + 1 || rect.top < svg.top - 1 || rect.bottom > svg.bottom + 1;
            });
            return { expectedHeight: viewport.clientHeight, height: cover.height, overflow };
          }
          return null;
        });
        expect(dimensions).toBeTruthy();
        expect(dimensions!.height).toBe(dimensions!.expectedHeight);
        expect(dimensions!.overflow).toBe(false);
        const toc = page.locator('[data-reader="toc"]');
        expect(await toc.locator('option').count()).toBeGreaterThan(2);
        const firstSection = await toc.locator('option').nth(1).getAttribute('value');
        await toc.selectOption(firstSection!);
        await page.locator('.reader-settings summary').click();
        await page.locator('[data-reader="font"]').selectOption('lora');
        await page.locator('[data-reader="size"]').fill('24');
        await page.locator('[data-reader="justify"]').check();
        await page.locator('[data-reader="hyphenate"]').uncheck();
        await page.locator('[data-reader="palette"]').selectOption('oled');
        await expect.poll(() => page.evaluate(() => {
          const frames = document.querySelectorAll<HTMLIFrameElement>('[data-reader="viewport"] iframe');
          for (const frame of frames) {
            const doc = frame.contentDocument;
            if (!doc || doc.querySelector('.literae-cover')) continue;
            const p = doc.querySelector('p');
            if (!p) continue;
            const style = frame.contentWindow!.getComputedStyle(p);
            return { font: style.fontFamily, size: style.fontSize, align: style.textAlign, hyphens: style.hyphens,
              background: frame.contentWindow!.getComputedStyle(doc.body).backgroundColor };
          }
          return null;
        })).toEqual({ font: '"Literae Lora", Georgia, serif', size: '24px', align: 'justify', hyphens: 'none', background: 'rgb(0, 0, 0)' });
        expect(errors).toEqual([]);
      });
    }
  });
}
