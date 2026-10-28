import { test, expect, devices, type Page } from '@playwright/test';
import matrix from '../fixtures/notes-catalog.json' with { type: 'json' };
import { chooseChapterHref, openToc } from './reader-helpers';
const MAIN = 'https://literae.ch',
  LOCAL = 'http://127.0.0.1:4322';
test.use({
  baseURL: MAIN,
  viewport: { width: 1920, height: 1080 },
  userAgent: devices['Desktop Chrome'].userAgent,
  isMobile: false,
  hasTouch: false,
  deviceScaleFactor: 1,
  ...(process.env.HTTPS_PROXY
    ? {
        proxy: {
          server: process.env.HTTPS_PROXY,
          bypass: '127.0.0.1,localhost',
        },
      }
    : {}),
});
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    (window as any).__chapters = [];
    document.addEventListener('reader:chapter-positioned', (event) =>
      (window as any).__chapters.push((event as CustomEvent).detail.href),
    );
  });
  await context.route(MAIN + '/**', async (route) => {
    const u = new URL(route.request().url());
    await route.fulfill({
      response: await route.fetch({ url: LOCAL + u.pathname + u.search }),
    });
  });
});
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: 'wait' });
});
async function chapterOffset(page: Page, href: string) {
  return page.locator('.epub-container').evaluate((container, href) => {
    const id = decodeURIComponent(href.split('#')[1] || '');
    for (const frame of container.querySelectorAll('iframe')) {
      if (
        !frame.contentDocument?.documentElement?.dataset.readerSource?.endsWith(
          '/' + href.split('#')[0],
        )
      )
        continue;
      const target = id ? frame.contentDocument.getElementById(id) : null;
      if (!id || target)
        return (
          (target?.getBoundingClientRect().top || 0) +
          frame.getBoundingClientRect().top -
          container.getBoundingClientRect().top
        );
    }
    return null;
  }, href);
}
for (const title of [
  'La Cité de Dieu',
  'Sainte Bible traduite par A. Crampon',
  'Confessions',
])
  test(`Premier clic du sommaire : ${title}`, async ({
    page,
    request,
  }, info) => {
    test.setTimeout(180000);
    const book = matrix.find((b) => b.title === title)!;
    const catalogue = (
      await (await request.get(LOCAL + '/scriptorium/bibliotheque.json')).json()
    ).items;
    await page.goto(
      catalogue.find((b: { id: string }) => b.id === book.bookId).href,
    );
    await expect(page.locator('[data-reader="viewport"]')).toHaveAttribute(
      'aria-busy',
      'false',
    );
    const links = await page
      .locator('[data-reader="toc-link"]')
      .evaluateAll((links) =>
        links
          .map((a) => (a as HTMLElement).dataset.href!)
          .filter((href) => !href.includes('titlepage')),
      );
    const picks = [
      links[Math.floor(links.length * 0.6)],
      links[Math.floor(links.length * 0.15)],
      links[Math.floor(links.length * 0.8)],
      links[Math.floor(links.length * 0.35)],
    ];
    const measurements = [];
    for (const href of picks) {
      const previous = await page.evaluate(
        () => (window as any).__chapters.length,
      );
      await chooseChapterHref(page, href);
      await expect
        .poll(
          () =>
            page.evaluate(
              (previous) => (window as any).__chapters[previous],
              previous,
            ),
          { timeout: 15000 },
        )
        .toBe(href);
      await page.waitForTimeout(600); // Measure after late iframe reflow, without auto-scrolling a locator.
      const position = await chapterOffset(page, href);
      measurements.push({ href, position });
      await info.attach('chapter-positions', {
        body: JSON.stringify(measurements),
        contentType: 'application/json',
      });
      expect(position, href).not.toBeNull();
      expect(position!, href).toBeGreaterThanOrEqual(-4);
      expect(position!, href).toBeLessThanOrEqual(40);
    }
    // Two choices without waiting for the first display exercise cancellation.
    const first = picks[0],
      latest = picks[2];
    await openToc(page);
    await page
      .locator(`[data-reader="toc-link"][data-href="${first}"]`)
      .last()
      .click();
    await openToc(page);
    await page
      .locator(`[data-reader="toc-link"][data-href="${latest}"]`)
      .last()
      .click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__chapters.at(-1)))
      .toBe(latest);
    await page.waitForTimeout(600);
    const final = await chapterOffset(page, latest);
    expect(final).not.toBeNull();
    expect(final!).toBeGreaterThanOrEqual(-4);
    expect(final!).toBeLessThanOrEqual(40);
  });
